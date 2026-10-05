#!/usr/bin/env node
/**
 * Prisma CLI wrapper.
 *
 * Why this exists: the Prisma CLI only auto-loads `.env`, but this project keeps
 * its secrets in `.env.local` (which Next.js and Vercel both read). This script
 * loads `.env.local` into the process environment - without ever overwriting a
 * variable that is already set, so CI / Vercel environment variables always win -
 * and then hands control to the Prisma CLI.
 *
 * It also makes `DIRECT_URL` optional: when only a pooled Neon connection string
 * is configured, migrations fall back to it (slower, but correct for a single
 * developer or a tiny database). See README "Neon configuration".
 *
 * Usage:  node scripts/run-prisma.js migrate dev
 *         node scripts/run-prisma.js generate
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, ROOT } = require('./env-loader');

loadEnv({ requireDatabase: true });

function resolveCli() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(ROOT, '..', 'prisma', 'build', 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error('[run-prisma] Could not locate the Prisma CLI. Run `npm install` first.');
  process.exit(1);
}

const child = spawn(process.execPath, [resolveCli(), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: ROOT,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});