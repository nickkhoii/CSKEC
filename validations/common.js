import { z } from 'zod';
import { Prisma } from '@prisma/client';

/**
 * ---------------------------------------------------------------------------
 * Shared Zod primitives
 * ---------------------------------------------------------------------------
 * Every server action and API route parses its input through these schemas. The
 * client reuses them for friendly inline errors, but the client is never trusted
 * - the exact same schema runs again on the server.
 */

/** Trim, bound length, and reject control characters. */
export const requiredText = (label, { min = 1, max = 255, multiline = false } = {}) =>
  z
    .string({
      required_error: `${label} is required.`,
      invalid_type_error: `${label} is required.`,
    })
    .trim()
    .min(min, `${label} must be at least ${min} character${min === 1 ? '' : 's'}.`)
    .max(max, `${label} must be at most ${max} characters.`)
// Reject C0 control characters (NUL, BEL, ESC, ...) and DEL. They have no
    // place in a person's name and are used for log-injection / header-splitting
    // tricks. Printable characters - including <, > and quotes - are allowed:
    // React escapes them on render, which is the real XSS defence.
    // eslint-disable-next-line no-control-regex
    .refine((value) => !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/).test(value), {
      message: `${label} contains invalid characters.`,
    });

export const optionalText = (label, { max = 2000 } = {}) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/**
 * Email: one `@`, no whitespace, no leading/trailing/consecutive dots in either
 * part, and a domain with a real TLD. Normalised to lower case before it ever
 * reaches the database.
 */
export const emailField = z
  .string({ required_error: 'Email address is required.' })
  .trim()
  .min(5, 'Email address is too short.')
  .max(254, 'Email address is too long.')
  .toLowerCase()
  .refine(
    (value) => /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(value),
    { message: 'Enter a valid email address.' },
  );

/**
 * Money as a Prisma Decimal.
 *
 * The format and range checks deliberately run against the *string*, before the
 * Decimal is constructed. Comparing on a Decimal instance here would depend on
 * Decimal method names surviving bundler/interop differences; validating the
 * canonical string is both simpler and safer.
 *
 * Accepts strings and numbers. Rejects NaN, exponents, and anything with more
 * than two decimal places - which would silently lose money.
 */
export const moneyField = (label = 'Amount', { allowZero = false } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === 'string' ? value.trim() : String(value)))
    .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
      message: `${label} must be a number with at most 2 decimal places.`,
    })
    .refine((value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && (allowZero ? numeric >= 0 : numeric > 0);
    }, {
      message: allowZero ? `${label} cannot be negative.` : `${label} must be greater than 0.`,
    })
    // Constructed last, once the value is known to be safe.
    .transform((value) => new Prisma.Decimal(value));

/** `YYYY-MM-DD` that also parses as a real calendar date. */
export const dateField = (label = 'Date') =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use the format YYYY-MM-DD.`)
    .refine((value) => {
      const [y, m, d] = value.split('-').map(Number);
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      );
    }, `${label} is not a valid calendar date.`);

/** Optional `YYYY-MM-DD`. Empty string becomes null. */
export const optionalDateField = (label = 'Date') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) =>
      value === null || value === undefined || value === '' ? null : value,
    )
    .refine((value) => value === null || dateField(label).safeParse(value).success, {
      message: `${label} must use the format YYYY-MM-DD.`,
    });

/** A timestamp the client sends as `datetime-local` (`YYYY-MM-DDTHH:mm`). */
export const dateTimeField = (label = 'Date and time') =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), `${label} is not a valid date.`)
    .transform((value) => new Date(value));

export const optionalDateTimeField = (label = 'Date and time') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) =>
      value === null || value === undefined || value === '' ? null : value,
    )
    .refine((value) => value === null || !Number.isNaN(new Date(value).getTime()), {
      message: `${label} is not a valid date.`,
    });

export const monthField = z.coerce
  .number({ invalid_type_error: 'Month must be a number.' })
  .int('Month must be a whole number.')
  .min(1, 'Month must be between 1 and 12.')
  .max(12, 'Month must be between 1 and 12.');

export const yearField = z.coerce
  .number({ invalid_type_error: 'Year must be a number.' })
  .int('Year must be a whole number.')
  .min(1900, 'Year must be 1900 or later.')
  .max(2999, 'Year must be 2999 or earlier.');

/** Phone: `+63 9xx xxx xxxx`, a landline, or any 6-20 digit run. */
export const phoneField = z
  .string()
  .trim()
  .max(30)
  .refine((value) => value === '' || /^\+?[0-9][0-9\s()-]{5,19}$/.test(value), {
    message: 'Enter a valid contact number.',
  });

export const cuidField = (label = 'Record') =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(8, `${label} identifier is invalid.`)
    .max(40, `${label} identifier is invalid.`)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, `${label} identifier is invalid.`);

/** Password policy, enforced identically on register / change / admin reset. */
export const passwordField = (label = 'Password') =>
  z
    .string({ required_error: `${label} is required.` })
    .min(10, `${label} must be at least 10 characters long.`)
    .max(200, `${label} must be at most 200 characters long.`)
    .regex(/[a-z]/, `${label} must contain a lowercase letter.`)
    .regex(/[A-Z]/, `${label} must contain an uppercase letter.`)
    .regex(/\d/, `${label} must contain a number.`)
    .regex(/[^A-Za-z0-9]/, `${label} must contain a symbol.`)
    .refine((value) => new TextEncoder().encode(value).length <= 72, `${label} must be at most 72 bytes long.`);

/** `{ field: message }` map for form rendering. */
export function fieldErrors(error) {
  const out = {};
  for (const issue of error?.issues ?? []) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** First human-readable message from a ZodError. */
export function firstError(error) {
  return error?.issues?.[0]?.message ?? 'The submitted data is not valid.';
}
