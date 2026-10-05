import { Prisma } from '@prisma/client';
import { fieldErrors, firstError } from '@/validations/common';

/**
 * ---------------------------------------------------------------------------
 * Server action result contract
 * ---------------------------------------------------------------------------
 * Every action returns the same shape so client components can render feedback
 * without special-casing:
 *   { success: true,  data?, message? }
 *   { success: false, message, fieldErrors? }
 *
 * Errors are safe to show a user: domain errors carry a friendly message, while
 * unexpected database errors are logged server-side and replaced with a generic
 * message so stack traces and SQL never reach the browser.
 */

export function ok(data = null, message = null) {
  return { success: true, data, message };
}

export function fail(message, fieldErrorsMap = null) {
  return { success: false, message, fieldErrors: fieldErrorsMap ?? undefined };
}

/** Map a ZodError into the shared failure shape. */
export function fromZod(error) {
  return fail(firstError(error), fieldErrors(error));
}

/**
 * Map a Prisma error into the shared failure shape.
 * P2002 = unique violation, P2003 = foreign key violation, P2025 = not found.
 */
export function fromPrisma(error, friendlyMessages = {}) {
  const code = error?.code;
  if (code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'value';
    return fail(friendlyMessages.duplicate ?? `That ${target} is already in use.`, {
      [String(target).split(',')[0].trim()]: friendlyMessages.duplicate ?? 'This value is already in use.',
    });
  }
  if (code === 'P2003') {
    return fail(friendlyMessages.reference ?? 'A related record is missing or still in use.');
  }
  if (code === 'P2025') {
    return fail(friendlyMessages.missing ?? 'That record no longer exists.');
  }
  console.error('[action] database error', { code, message: error?.message });
  return fail('Something went wrong while saving. Please try again.');
}

/** Is this a Prisma "unique constraint" error? */
export function isUniqueViolation(error) {
  return error?.code === 'P2002';
}

/**
 * Run an action body, converting thrown domain / validation / database errors
 * into the shared failure shape.
 *
 * @param {() => Promise<any>} body
 * @param {{ successMessage?: string, friendly?: object, silent?: boolean }} [options]
 */
export async function runAction(body, options = {}) {
  const { successMessage = null, friendly = {}, silent = false } = options;
  try {
    const data = await body();
    // Allow a body to return its own failure object.
    if (data && typeof data === 'object' && 'success' in data) return data;
    return ok(data, successMessage);
  } catch (error) {
    if (!silent) {
      console.error('[action] failed', {
        name: error?.name,
        code: error?.code,
        message: error?.message,
      });
    }
    // Domain errors (AttendanceError, FinanceError, OfficerError, ...) already
    // carry a message that is safe and useful for the user.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return fromPrisma(error, friendly);
    }
    if (error?.name?.endsWith('Error') && typeof error?.message === 'string') {
      return fail(error.message);
    }
    return fail('Something went wrong. Please try again.');
  }
}

/**
 * Server-side authorization guard for actions.
 * Returns an error result instead of throwing so forms can render it inline.
 */
export function denied(message = 'You do not have permission to perform this action.') {
  return { success: false, message, denied: true };
}

/** Read a FormData value as a trimmed string (or null when empty). */
export function str(formData, key, fallback = null) {
  const value = formData?.get?.(key);
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text.length === 0 ? fallback : text;
}

/** Read all values for a key (checkbox groups / multi-select). */
export function list(formData, key) {
  const values = formData?.getAll?.(key) ?? [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}