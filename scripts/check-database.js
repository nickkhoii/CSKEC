require('./env-loader').loadEnv();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count()
  .then((count) => console.log(`Database reachable; ${count} accounts.`))
  .catch((error) => { console.error(`Database unavailable (${error.code || 'connection error'}).`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
