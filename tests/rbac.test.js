import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleCan,
  roleCanAll,
  roleCanAny,
  isValidRole,
  canReviewOwnRecord,
  dashboardPathForRole,
} from '@/lib/rbac';
import ROLE_DEFINITIONS from '@/config/roles.json';

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS);

describe('RBAC - permission resolution', () => {
  it('exposes every permission as a namespaced string', () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(permission).toMatch(/^[a-z_]+:[a-z_]+$/);
    }
  });

  it('grants nothing to an unknown role', () => {
    expect(roleCan('NOT_A_ROLE', PERMISSIONS.DASHBOARD_VIEW)).toBe(false);
    expect(permissionsForRole('NOT_A_ROLE')).toEqual([]);
  });

  it('grants nothing for an unknown permission', () => {
    expect(roleCan('SYSTEM_ADMIN', 'totally:made-up')).toBe(false);
  });

  it('returns a copy so callers cannot mutate the matrix', () => {
    const first = permissionsForRole('MEMBER');
    first.push('user:manage');
    expect(permissionsForRole('MEMBER')).not.toContain('user:manage');
  });
});

describe('RBAC - role capabilities', () => {
  it('lets every member-level role reach shared features', () => {
    // SYSTEM_ADMIN is deliberately excluded: it is an operator account with no
    // club membership, so it does not submit attendance or payments.
    const memberRoles = ALL_ROLES.filter((r) => r !== 'SYSTEM_ADMIN');
    for (const role of memberRoles) {
      expect(roleCan(role, PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
      expect(roleCan(role, PERMISSIONS.POST_VIEW)).toBe(true);
      expect(roleCan(role, PERMISSIONS.NOTICE_VIEW)).toBe(true);
      expect(roleCan(role, PERMISSIONS.ATTENDANCE_SUBMIT)).toBe(true);
      expect(roleCan(role, PERMISSIONS.FINANCE_SUBMIT_PAYMENT)).toBe(true);
    }
  });

  it('gives the System Administrator no club-participation rights', () => {
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.ATTENDANCE_SUBMIT)).toBe(false);
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.FINANCE_SUBMIT_PAYMENT)).toBe(false);
  });

  it('restricts attendance approval to the Secretary', () => {
    expect(roleCan('SECRETARY', PERMISSIONS.ATTENDANCE_REVIEW)).toBe(true);
    for (const role of ALL_ROLES.filter((r) => r !== 'SECRETARY')) {
      expect(roleCan(role, PERMISSIONS.ATTENDANCE_REVIEW)).toBe(false);
    }
  });

  it('restricts payment verification to the Treasurer', () => {
    expect(roleCan('TREASURER', PERMISSIONS.FINANCE_REVIEW_PAYMENT)).toBe(true);
    for (const role of ALL_ROLES.filter((r) => r !== 'TREASURER')) {
      expect(roleCan(role, PERMISSIONS.FINANCE_REVIEW_PAYMENT)).toBe(false);
    }
  });

  it('restricts user administration to the System Administrator', () => {
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.USER_MANAGE)).toBe(true);
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.USER_ROLE_ASSIGN)).toBe(true);
    for (const role of ALL_ROLES.filter((r) => r !== 'SYSTEM_ADMIN')) {
      expect(roleCan(role, PERMISSIONS.USER_MANAGE)).toBe(false);
      expect(roleCan(role, PERMISSIONS.USER_ROLE_ASSIGN)).toBe(false);
    }
  });

  it('gives the President officer management but NOT approval rights', () => {
    expect(roleCan('PRESIDENT', PERMISSIONS.OFFICER_MANAGE)).toBe(true);
    // A President can review the club, never approve its attendance or money.
    expect(roleCan('PRESIDENT', PERMISSIONS.ATTENDANCE_REVIEW)).toBe(false);
    expect(roleCan('PRESIDENT', PERMISSIONS.FINANCE_REVIEW_PAYMENT)).toBe(false);
    expect(roleCan('PRESIDENT', PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS)).toBe(false);
    // ...and never system administration.
    expect(roleCan('PRESIDENT', PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(roleCan('PRESIDENT', PERMISSIONS.AUDIT_VIEW)).toBe(false);
    expect(roleCan('PRESIDENT', PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });

  it('never gives the System Administrator financial approval rights', () => {
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.FINANCE_REVIEW_PAYMENT)).toBe(false);
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.FINANCE_MANAGE_DUES)).toBe(false);
    expect(roleCan('SYSTEM_ADMIN', PERMISSIONS.ATTENDANCE_REVIEW)).toBe(false);
  });

  it('keeps a plain member read-only outside their own records', () => {
    const member = ROLE_PERMISSIONS.MEMBER;
    expect(member).toContain(PERMISSIONS.FINANCE_VIEW_OWN);
    expect(member).not.toContain(PERMISSIONS.FINANCE_VIEW_ALL);
    expect(member).not.toContain(PERMISSIONS.MEMBER_VIEW_ALL);
    expect(member).not.toContain(PERMISSIONS.POST_MANAGE);
    expect(member).not.toContain(PERMISSIONS.OFFICER_MANAGE);
  });

  it('supports roleCanAll / roleCanAny', () => {
    expect(
      roleCanAll('TREASURER', [PERMISSIONS.FINANCE_REVIEW_PAYMENT, PERMISSIONS.FINANCE_MANAGE_DUES]),
    ).toBe(true);
    expect(
      roleCanAll('MEMBER', [PERMISSIONS.FINANCE_REVIEW_PAYMENT, PERMISSIONS.FINANCE_VIEW_OWN]),
    ).toBe(false);
    expect(roleCanAny('MEMBER', [PERMISSIONS.USER_MANAGE, PERMISSIONS.FINANCE_VIEW_OWN])).toBe(true);
  });
});

describe('RBAC - configuration integrity', () => {
  it('recognises exactly the five configured roles', () => {
    expect(ROLE_DEFINITIONS.roles).toHaveLength(5);
    for (const role of ROLE_DEFINITIONS.roles) expect(isValidRole(role.key)).toBe(true);
  });

  it('keeps config/roles.json and the enforced matrix in sync', () => {
    for (const role of ROLE_DEFINITIONS.roles) {
      expect(ROLE_PERMISSIONS[role.key]).toEqual(role.permissions);
    }
  });

  it('only grants permissions the application knows about', () => {
    const known = new Set(Object.values(PERMISSIONS));
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(known.has(permission), `${role} has unknown permission ${permission}`).toBe(true);
      }
    }
  });
});

describe('RBAC - business rules', () => {
  it('forbids self-review when the reviewer owns the record', () => {
    expect(canReviewOwnRecord('SECRETARY', 'member-1', 'member-1')).toBe(false);
    expect(canReviewOwnRecord('SECRETARY', 'member-1', 'member-2')).toBe(true);
  });

  it('allows review when the staff account has no member record', () => {
    expect(canReviewOwnRecord('TREASURER', 'member-1', null)).toBe(true);
  });

  it('routes each role to its own dashboard', () => {
    expect(dashboardPathForRole('MEMBER')).toBe('/member/dashboard');
    expect(dashboardPathForRole('SECRETARY')).toBe('/secretary/dashboard');
    expect(dashboardPathForRole('TREASURER')).toBe('/treasurer/dashboard');
    expect(dashboardPathForRole('PRESIDENT')).toBe('/president/dashboard');
    expect(dashboardPathForRole('SYSTEM_ADMIN')).toBe('/admin/dashboard');
    // Unknown roles must never reach a privileged area.
    expect(dashboardPathForRole('HACKER')).toBe('/member/dashboard');
  });
});