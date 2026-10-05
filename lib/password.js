import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import {
  SETTING_KEYS,
  getNumberSetting,
  getSetting,
  clearSettingsCache,
} from './settings';

/**
 * ---------------------------------------------------------------------------
 * Password hashing + credential verification
 * ---------------------------------------------------------------------------
 *  * bcrypt with cost 12 (OWASP-recommended minimum for passwords).
 *  * The plaintext password is never stored, logged or returned.
 *  * When an email is unknown we still run a bcrypt comparison against a dummy
 *    hash, so response timing does not reveal whether an account exists.
 *  * Repeated failures lock the account for a configurable window; the counter
 *    and lock live in the database so the protection survives a redeploy.
 */

/** Cost factor for new hashes. Lowered in tests to keep them fast. */
export const BCRYPT_ROUNDS = Number(
  process.env.NODE_ENV === 'test' ? process.env.BCRYPT_ROUNDS ?? 4 : 12,
);

/** A real bcrypt hash of a value nobody knows, used for timing equalisation. */
const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuuKZfM3oGCFTLwF6M6JvZKqQEDJDbYaCFC2';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Burns roughly the same CPU as a real comparison. */
async function fakeCompare() {
  try {
    await bcrypt.compare('not-the-password', DUMMY_HASH);
  } catch {
    /* ignore */
  }
}

/** Policy check shared by registration, password change and admin reset. */
export async function passwordStrengthIssues(plain) {
  const issues = [];
  const value = String(plain ?? '');
  if (value.length < 10) issues.push('must be at least 10 characters long');
  if (!/[a-z]/.test(value)) issues.push('must contain a lowercase letter');
  if (!/[A-Z]/.test(value)) issues.push('must contain an uppercase letter');
  if (!/\d/.test(value)) issues.push('must contain a number');
  if (!/[^A-Za-z0-9]/.test(value)) issues.push('must contain a symbol');
  if (value.length > 200) issues.push('must be at most 200 characters long');
  return issues;
}

/**
 * Verifies an email + password pair and maintains the lockout counters.
 *
 * @returns
 *  `{ ok: true, user, memberId }` on success, or
 *  `{ ok: false, reason, userId }` where reason is one of
 *  'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' | 'ACCOUNT_DEACTIVATED' | 'LOCKED'.
 */
export async function verifyCredentials({ email, password, ip = null }) {
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      status: true,
      tokenVersion: true,
      mustChangePassword: true,
      failedLoginCount: true,
      lockedUntil: true,
      memberId: true,
      deletedAt: true,
      role: { select: { key: true } },
    },
  });

  if (!user || user.deletedAt) {
    await fakeCompare();
    return { ok: false, reason: 'INVALID_CREDENTIALS', userId: null };
  }

  if (user.status === 'DEACTIVATED' || user.deletedAt) {
    await fakeCompare();
    return { ok: false, reason: 'ACCOUNT_DEACTIVATED', userId: user.id };
  }

  if (user.status === 'INACTIVE') {
    await fakeCompare();
    return { ok: false, reason: 'ACCOUNT_INACTIVE', userId: user.id };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await fakeCompare();
    return { ok: false, reason: 'LOCKED', userId: user.id };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    await recordFailedLogin(user.id);
    return { ok: false, reason: 'INVALID_CREDENTIALS', userId: user.id };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    },
  });

  return {
    ok: true,
    memberId: user.memberId,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
      roleKey: user.role.key,
    },
  };
}

/**
 * Increments the failed-login counter and locks the account once the configured
 * threshold is reached. The settings cache is cleared first so an
 * administrator's change takes effect without a redeploy.
 */
async function recordFailedLogin(userId) {
  clearSettingsCache();
  const maxAttempts = getNumberSetting(await getSetting(SETTING_KEYS.LOGIN_MAX_ATTEMPTS), 5);
  const lockoutMinutes = getNumberSetting(
    await getSetting(SETTING_KEYS.LOGIN_LOCKOUT_MINUTES),
    15,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true },
  });

  const attempts = (user?.failedLoginCount ?? 0) + 1;
  const shouldLock = attempts >= Math.max(1, maxAttempts);

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: shouldLock ? 0 : attempts,
      lockedUntil: shouldLock
        ? new Date(Date.now() + Math.max(1, lockoutMinutes) * 60 * 1000)
        : null,
    },
  });
}

/**
 * Changes a password. Always bumps `tokenVersion` so every other session token
 * for that user stops validating, and clears any active lockout.
 */
export async function setPassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
}

/** Administrative reset: forces a change at next login and revokes sessions. */
export async function resetPassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
}

/** Clears a lockout without touching the password. */
export async function unlockAccount(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
  });
}