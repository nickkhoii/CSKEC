// Singleton Prisma client.
//
// In development Next.js hot-reloads modules, which would otherwise open a new
// connection pool on every reload until Postgres refuses connections.
// `serverExternalPackages` in next.config.mjs keeps the engine out of the bundle.

const globalForPrisma = globalThis;

function createClient() {
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

const prisma = globalForPrisma.__cskecPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__cskecPrisma = prisma;
}

/**
 * Prisma wraps unique-constraint violations in P2002. Business code catches this
 * to turn a race condition into a friendly "already exists" message instead of a 500.
 */
const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

module.exports = {
  prisma,
  default: prisma,
  Prisma: require('@prisma/client').Prisma,
  UNIQUE_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  RECORD_NOT_FOUND,
};