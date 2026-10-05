import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSIONS, roleCan as _roleCan } from '@/lib/rbac';

const rbac = { roleCan: _roleCan };

/**
 * ---------------------------------------------------------------------------
 * Route integrity
 *
 * Every internal `href` / `action` in the app must resolve to a real page or
 * API route. A dead link is a 404 for a real user, and these are the easiest
 * defects in a portal to introduce and the easiest to miss in review - the
 * navigation menu and the dashboards in particular are full of hard-coded paths.
 *
 * This suite walks the source tree, so it needs no database and no build.
 * ---------------------------------------------------------------------------
 */

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');
const SCAN_DIRS = [APP_DIR, path.join(ROOT, 'components'), path.join(ROOT, 'actions')];

/** Route segments in parentheses are Next.js groups and never appear in a URL. */
const GROUP_SEGMENT = /\([^)]*\)/g;

/** `/admin/audit` from an absolute file path, with groups and slashes normalised. */
function toRoutePath(absoluteFile) {
  const relative = path.relative(APP_DIR, absoluteFile);
  return `/${relative
    .replace(/[\\/]page\.jsx$/, '')
    .replace(/[\\/]route\.js$/, '')
    .replace(GROUP_SEGMENT, '')
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')}`.replace(/\/{2,}/g, '/');
}

function walk(dir, extensions = ['.js', '.jsx']) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Collects every URL the app exposes: /segment/segment and /segment/[id]. */
/** route -> absolute path of the page file, so tests can read the source. */
const ROUTE_FILES = new Map();

function collectRoutes() {
  const routes = new Set();
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.name === 'page.jsx' || entry.name === 'route.js') {
        const route = toRoutePath(full);
        routes.add(route);
        if (entry.name === 'page.jsx') ROUTE_FILES.set(route, full);
      }
    }
  };
  visit(APP_DIR);
  return routes;
}

const ROUTES = collectRoutes();
const routeFiles = ROUTE_FILES;

/** Does a link match a real route, allowing `[id]` to satisfy a concrete id? */
function resolves(href) {
  if (href === '/' || ROUTES.has(href)) return true;
  const dynamic = [...ROUTES].filter((route) => route.includes('['));
  return dynamic.some((route) => {
    const pattern = route
      .split('/')
      .map((segment) => (segment.startsWith('[') ? '[^/]+' : segment))
      .join('/');
    return new RegExp(`^${pattern}$`).test(href);
  });
}

/** Extracts internal link targets from a source file. */
function extractLinks(file) {
  const source = fs.readFileSync(file, 'utf8');
  const links = [];
  const patterns = [
    /href=\{\s*`([^`$][^`]*)`\s*\}/g, // href={`/literal`}
    /href=["'](\/[^"'#?]*)/g, // href="/literal"
    /action=["'](\/[^"']*)/g, // <form action="/literal">
    /revalidatePath\(\s*['"`](\/[^'"`]*)/g,
    /\blink:\s*['"`](\/[^'"`]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) links.push(match[1]);
  }
  return links.filter((href) => !href.includes('${'));
}

describe('route integrity', () => {
  it('discovers a non-trivial number of routes', () => {
    // Guards the test itself: if discovery breaks, it would "pass" vacuously.
    expect(ROUTES.size).toBeGreaterThan(20);
  });

  it('every internal link resolves to a real page or API route', () => {
    const broken = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        for (const href of extractLinks(file)) {
          const pathOnly = href.split('?')[0].split('#')[0];
          if (pathOnly && !resolves(pathOnly)) {
            broken.push(`${path.relative(ROOT, file)} -> ${href}`);
          }
        }
      }
    }
    expect(broken, `Dead internal links:\n${broken.join('\n')}`).toEqual([]);
  });

  it('the navigation menu only links to real routes', () => {
    const nav = fs.readFileSync(path.join(ROOT, 'components', 'layout', 'navigation.js'), 'utf8');
    const hrefs = [...nav.matchAll(/href:\s*'(\/[^']+)'/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(10);
    const broken = hrefs.filter((href) => !resolves(href));
    expect(broken, `Navigation links to missing routes: ${broken.join(', ')}`).toEqual([]);
  });

  /**
   * Every role-specific page must call a guard from lib/session.js. A page with
   * no guard would render for any signed-in user - the classic "I hand-crafted
   * the URL" vulnerability. This asserts the guard is actually present in source.
   */
  const GUARDED_ROUTES = [
    '/secretary/members', '/secretary/posts', '/secretary/activities', '/secretary/notices',
    '/secretary/meetings', '/secretary/attendance', '/secretary/officers',
    '/treasurer/payments', '/treasurer/dues', '/treasurer/obligations', '/treasurer/transactions',
    '/treasurer/delinquent',
    '/president/officers', '/president/overview',
    '/admin/users', '/admin/audit', '/admin/settings',
    '/reports/member-master', '/reports/cash-flow',
    '/attendance', '/payments', '/profile', '/settings',
    '/updates', '/notices', '/meetings', '/officers', '/notifications',
  ];

  const GUARDS = ['requireRole(', 'requirePermission(', 'requireUser(', 'requireUserApi('];

  it('every role-specific page enforces a server-side guard', () => {
    const unguarded = [];
    for (const route of GUARDED_ROUTES) {
      // Route groups are invisible in the URL, so locate the file by scanning.
      const file = routeFiles.get(route);
      if (!file) {
        unguarded.push(`${route} (page not found)`);
        continue;
      }
      const source = fs.readFileSync(file, 'utf8');
      if (!GUARDS.some((guard) => source.includes(guard))) unguarded.push(route);
    }
    expect(unguarded, `Pages with no session guard:\n${unguarded.join('\n')}`).toEqual([]);
  });

  /**
   * The RBAC matrix itself: no role may hold a privilege that belongs to another
   * role's module. These are the privilege-escalation boundaries the whole
   * permission model depends on.
   */
  it('a plain Club Member holds no officer, finance or admin permission', () => {
    const { roleCan } = rbac;
    const forbidden = [
      PERMISSIONS.MEMBER_MANAGE, PERMISSIONS.POST_MANAGE, PERMISSIONS.ATTENDANCE_REVIEW,
      PERMISSIONS.FINANCE_REVIEW_PAYMENT, PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS,
      PERMISSIONS.OFFICER_MANAGE, PERMISSIONS.USER_MANAGE, PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
    ];
    for (const permission of forbidden) {
      expect(roleCan('MEMBER', permission), `MEMBER must not hold ${permission}`).toBe(false);
    }
  });

  it('the Secretary cannot move money or manage accounts', () => {
    const { roleCan } = rbac;
    for (const permission of [
      PERMISSIONS.FINANCE_REVIEW_PAYMENT, PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS,
      PERMISSIONS.FINANCE_VIEW_REPORTS, PERMISSIONS.USER_MANAGE, PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      expect(roleCan('SECRETARY', permission), `SECRETARY must not hold ${permission}`).toBe(false);
    }
  });

  it('the Treasurer cannot edit content, approve attendance or manage accounts', () => {
    const { roleCan } = rbac;
    for (const permission of [
      PERMISSIONS.POST_MANAGE, PERMISSIONS.NOTICE_MANAGE, PERMISSIONS.ATTENDANCE_REVIEW,
      PERMISSIONS.MEMBER_MANAGE, PERMISSIONS.USER_MANAGE, PERMISSIONS.OFFICER_MANAGE,
    ]) {
      expect(roleCan('TREASURER', permission), `TREASURER must not hold ${permission}`).toBe(false);
    }
  });

  it('the President has read-only visibility, not mutation rights', () => {
    const { roleCan } = rbac;
    for (const permission of [
      PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS, PERMISSIONS.FINANCE_REVIEW_PAYMENT,
      PERMISSIONS.MEMBER_MANAGE, PERMISSIONS.POST_MANAGE, PERMISSIONS.ATTENDANCE_REVIEW,
      PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      expect(roleCan('PRESIDENT', permission), `PRESIDENT must not hold ${permission}`).toBe(false);
    }
    // ...but does hold the oversight permissions.
    expect(roleCan('PRESIDENT', PERMISSIONS.OFFICER_MANAGE)).toBe(true);
    expect(roleCan('PRESIDENT', PERMISSIONS.FINANCE_VIEW_ALL)).toBe(true);
  });

  it('the System Administrator administers accounts but does not approve money', () => {
    const { roleCan } = rbac;
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.USER_MANAGE)).toBe(true);
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
    for (const permission of [
      PERMISSIONS.FINANCE_REVIEW_PAYMENT, PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS,
      PERMISSIONS.MEMBER_MANAGE, PERMISSIONS.ATTENDANCE_REVIEW,
    ]) {
      expect(roleCan('SYSTEM_ADMIN', permission), `SYSTEM_ADMIN must not hold ${permission}`).toBe(
        false,
      );
    }
  });
});