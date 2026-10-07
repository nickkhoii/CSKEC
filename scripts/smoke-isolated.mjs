import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { openSync, closeSync } from 'node:fs';

const db = new PGlite();
await db.waitReady;
for (const migration of (await readdir('prisma/migrations')).sort()) {
  if (migration !== 'migration_lock.toml') await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
}
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55433 });
await server.start();
const url = 'postgresql://postgres:postgres@127.0.0.1:55433/postgres?connection_limit=1&sslmode=disable&statement_cache_size=0';
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, SEED_DEMO_DATA: 'true',
  SEED_DEFAULT_PASSWORD: 'ChangeMe!2024', AUTH_SECRET: 'isolated-smoke-secret-for-tests-only-2026',
  AUTH_URL: 'http://127.0.0.1:3001', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3001', AUTH_USE_SECURE_COOKIES: 'false',
  SMOKE_BASE_URL: 'http://127.0.0.1:3001', SMOKE_PASSWORD: 'ChangeMe!2024', NEXT_DIST_DIR: '.next-smoke' };
async function run(args) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
  if (code !== 0) throw new Error(`Child process failed (${code}).`);
}
let app;
try {
  await run(['prisma/seed.js']);
  const { PrismaClient } = createRequire(import.meta.url)('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.user.updateMany({ data: { mustChangePassword: false } });
  const secretary = await prisma.user.findUniqueOrThrow({ where: { email: 'secretary@csec.local' } });
  const memberUser = await prisma.user.findUniqueOrThrow({ where: { email: 'member@csec.local' } });
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberUser.memberId } });
  const attendanceActivity = await prisma.activity.create({ data: {
    title: 'Browser minutes attendance', type: 'GMM', category: 'GMM', startsAt: new Date(),
    status: 'PUBLISHED', createdById: secretary.id,
  } });
  const attendanceMeeting = await prisma.meeting.create({ data: {
    title: 'Browser minutes attendance', meetingDate: new Date(), startTime: '19:00',
    activityId: attendanceActivity.id, createdById: secretary.id,
    minutes: { create: { title: 'Browser minutes attendance', status: 'SUBMITTED',
      preparedById: secretary.id, preparedByName: secretary.fullName } },
  } });
  await prisma.attendanceRecord.create({ data: {
    activityId: attendanceActivity.id, memberId: member.id, status: 'PRESENT',
    source: 'MANUAL', recordedById: secretary.id,
  } });
  env.SMOKE_ATTENDANCE_MEETING_ID = attendanceMeeting.id;
  env.SMOKE_ATTENDANCE_MEMBER_NUMBER = member.memberNumber;
  env.SMOKE_ACCOUNTS = JSON.stringify(await prisma.user.findMany({ where: { status: 'ACTIVE' },
    select: { email: true, mustChangePassword: true, role: { select: { key: true } } } }));
  await prisma.$disconnect();
  await mkdir('.data', { recursive: true });
  const log = openSync('.data/smoke-server.log', 'w');
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001'], { env, stdio: ['ignore', log, log] });
  closeSync(log);
  for (let tries = 0; tries < 60; tries += 1) {
    try { if ((await fetch(`${env.SMOKE_BASE_URL}/api/health`)).ok) break; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (process.env.SMOKE_BROWSER_ONLY !== 'true') await run(['scripts/smoke.js']);
  await run(['scripts/browser-smoke.js']);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { app?.kill(); await server.stop(); await db.close(); }
