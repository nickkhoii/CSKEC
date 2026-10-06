require('./env-loader').loadEnv();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const routes = {
  MEMBER: ['/member/dashboard', '/updates', '/notices', '/meetings', '/attendance', '/payments', '/notifications', '/profile', '/settings', '/officers'],
  SECRETARY: ['/secretary/dashboard', '/secretary/members', '/secretary/posts', '/secretary/activities', '/secretary/notices', '/secretary/meetings', '/secretary/attendance', '/secretary/officers', '/reports/member-master'],
  TREASURER: ['/treasurer/dashboard', '/treasurer/payments', '/treasurer/dues', '/treasurer/obligations', '/treasurer/transactions', '/treasurer/delinquent', '/reports/cash-flow', '/api/reports/transactions'],
  PRESIDENT: ['/president/dashboard', '/president/overview', '/president/officers', '/reports/cash-flow'],
  SYSTEM_ADMIN: ['/admin/dashboard', '/admin/users', '/admin/audit', '/admin/settings'],
};
async function main() {
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
  console.log('Health check passed.');
  const stale = await fetch(`${base}/login`, { headers: { Cookie: 'authjs.session-token=invalid' }, redirect: 'manual' });
  if (stale.status !== 200) throw new Error('Invalid cookie causes a login redirect.');
  console.log('Invalid cookie login check passed.');
  const users = process.env.SMOKE_ACCOUNTS ? JSON.parse(process.env.SMOKE_ACCOUNTS)
    : await prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null }, include: { role: true } });
  const password = process.env.SMOKE_PASSWORD || process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe!2024';
  let checked = 0;
  for (const [role, paths] of Object.entries(routes)) {
    const user = users.find((item) => item.role.key === role);
    if (!user || (!process.env.SMOKE_ACCOUNTS && !(await bcrypt.compare(password, user.passwordHash)))) throw new Error(`${role}: no account matches the configured smoke password.`);
    const cookies = new Map();
    async function request(url, options = {}) {
      const response = await fetch(`${base}${url}`, { ...options, headers: { ...options.headers,
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }, redirect: 'manual' });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';'); const index = pair.indexOf('=');
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    }
    const csrf = await (await request('/api/auth/csrf')).json();
    await request('/api/auth/callback/credentials', { method: 'POST', body: new URLSearchParams({
      csrfToken: csrf.csrfToken, email: user.email, password, callbackUrl: `${base}/dashboard` }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const session = await (await request('/api/auth/session')).json();
    if (!session.user?.id) throw new Error(`${role}: login failed.`);
    for (const route of paths) {
      const response = await request(route);
      await response.text();
      if (user.mustChangePassword && route !== '/profile') {
        if (route.startsWith('/api/')) {
          if (![401, 403].includes(response.status)) throw new Error(`${role}: ${route} allowed a temporary password.`);
        } else if (![303, 307].includes(response.status) || response.headers.get('location') !== '/profile') throw new Error(`${role}: ${route} temporary password restriction failed (${response.status}).`);
      } else if (response.status !== 200) throw new Error(`${role}: ${route} returned ${response.status}.`);
      checked += 1;
    }
    console.log(`${role}: signed in and checked ${paths.length} routes${user.mustChangePassword ? ' (password change enforced)' : ''}.`);
  }
  console.log(`${checked} authenticated route checks passed.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
