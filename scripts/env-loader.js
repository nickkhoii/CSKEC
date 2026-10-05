/**
 * Tiny .env loader shared by scripts/run-prisma.js and scripts/run-seed.js.
 *
 * Next.js reads `.env.local` automatically, but Node scripts and the Prisma CLI
 * do not. Variables that already exist in the real environment always win, so
 * CI and Vercel are never overridden by a local file.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** Minimal parser: KEY=VALUE with optional quotes and # comments. */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Loads `.env.local` then `.env` into `process.env` without clobbering values
 * that are already defined.
 *
 * @param {{ requireDatabase?: boolean, directUrlFallback?: boolean }} [options]
 */
function loadEnv(options = {}) {
  const { requireDatabase = false, directUrlFallback = true } = options;
  const merged = {};
  for (const file of ['.env.local', '.env']) {
    Object.assign(merged, parseEnvFile(path.join(ROOT, file)));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  if (directUrlFallback && !process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
  if (requireDatabase && !process.env.DATABASE_URL) {
    console.error(
      '\nDATABASE_URL is not set.\n' +
        '  Copy .env.example to .env.local and fill in your Neon connection string.\n' +
        '  See the README section "Neon PostgreSQL configuration".\n',
    );
    process.exit(1);
  }
  return process.env;
}

module.exports = { loadEnv, parseEnvFile, ROOT };