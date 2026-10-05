import { prisma } from './prisma';
import { headers as nextHeaders } from 'next/headers';

/**
 * ---------------------------------------------------------------------------
 * Audit trail
 * ---------------------------------------------------------------------------
 * Every security-sensitive action writes one row here. The writer is
 * intentionally forgiving: an audit failure must never roll back or break the
 * business transaction the user actually requested, so errors are logged to the
 * server console instead of being thrown.
 *
 * NEVER log: passwords, password hashes, session tokens, AUTH_SECRET, the
 * DATABASE_URL, or raw proof-of-payment contents.
 */

/** Metadata keys that are stripped before anything reaches the database. */
const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'passwordconfirm',
  'token',
  'tokenversion',
  'secret',
  'authsecret',
  'session',
  'cookie',
  'authorization',
  'databaseurl',
  'directurl',
  'accesstoken',
  'refreshtoken',
]);

const MAX_STRING = 500;
const MAX_DEPTH = 4;

/** Deep-scrub an arbitrary metadata object before persisting it. */
export function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return '[truncated]';

  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    // Prisma Decimal / BigInt wrappers serialise to objects - keep them readable.
    if (typeof value.toFixed === 'function' && typeof value.toNumber === 'function') {
      return value.toFixed(2);
    }
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
      out[key] = sanitizeMetadata(val, depth + 1);
    }
    return out;
  }

  return String(value);
}

/** Best-effort request context (IP + user agent) for the audit row. */
export async function getRequestContext() {
  try {
    const h = await nextHeaders();
    const forwardedFor = h.get('x-forwarded-for');
    const ip =
      (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ??
      h.get('x-real-ip') ??
      'unknown';
    const userAgent = h.get('user-agent') ?? 'unknown';
    return { ipAddress: ip.slice(0, 64), userAgent: userAgent.slice(0, 255) };
  } catch {
    // Called outside a request scope (e.g. from a seed script or a test).
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Record an audit entry.
 *
 * @param {object} entry
 * @param {import('@prisma/client').AuditCategory} entry.category
 * @param {string} entry.action           e.g. 'ATTENDANCE_APPROVED'
 * @param {string} [entry.entity]         e.g. 'AttendanceRequest'
 * @param {string} [entry.entityId]
 * @param {string} [entry.description]    Human readable summary
 * @param {object} [entry.user]           `{ id, email, role }`
 * @param {object} [entry.metadata]       Will be scrubbed
 * @param {object} [entry.context]        `{ ipAddress, userAgent }`
 */
export async function audit(entry) {
  try {
    const context = entry.context ?? (await getRequestContext());
    await prisma.auditLog.create({
      data: {
        category: entry.category,
        action: String(entry.action).slice(0, 120),
        entity: entry.entity ? String(entry.entity).slice(0, 80) : null,
        entityId: entry.entityId ? String(entry.entityId).slice(0, 120) : null,
        description: entry.description ? String(entry.description).slice(0, MAX_STRING) : null,
        userId: entry.user?.id ?? null,
        userEmail: entry.user?.email ?? null,
        userRole: entry.user?.role ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: sanitizeMetadata(entry.metadata) ?? undefined,
      },
    });
  } catch (error) {
    // Deliberately swallowed - audit logging must not break the user's action.
    console.error('[audit] failed to record entry', {
      action: entry?.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Snapshot the fields that changed, for before/after audit metadata. */
export function diffFields(before = {}, after = {}) {
  const changes = {};
  for (const key of Object.keys(after)) {
    const prev = before?.[key];
    const next = after[key];
    const prevStr = prev instanceof Date ? prev.toISOString() : (prev ?? null);
    const nextStr = next instanceof Date ? next.toISOString() : (next ?? null);
    if (JSON.stringify(prevStr) !== JSON.stringify(nextStr)) {
      changes[key] = { from: prevStr, to: nextStr };
    }
  }
  return changes;
}