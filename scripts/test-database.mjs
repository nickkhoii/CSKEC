import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Ephemeral PostgreSQL-compatible database: never connect tests to club data.
const db = new PGlite();
await db.waitReady;
for (const migration of (await readdir('prisma/migrations')).sort()) {
  if (migration === 'migration_lock.toml') continue;
  await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
}
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55432 });
await server.start();
const url = 'postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable';
console.log('Isolated database listening on 127.0.0.1:55432.');
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner'], {
  stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url },
});
const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
await server.stop();
await db.close();
process.exitCode = code ?? 1;
