import { Prisma } from '@prisma/client';

/**
 * ---------------------------------------------------------------------------
 * Money helpers
 * ---------------------------------------------------------------------------
 * All monetary values are stored as PostgreSQL `numeric(12,2)` and handled as
 * Prisma `Decimal` objects - never JavaScript floats. Floating point money is
 * the classic source of "the total is off by one centavo" bugs in club ledgers.
 *
 * These helpers are pure so they can be unit tested without a database.
 */

const { Decimal } = Prisma;

/** Number of decimal places the ledger stores. */
export const MONEY_SCALE = 2;

const zero = new Decimal(0);

/**
 * Coerce anything (string, number, Decimal, null) into a Decimal.
 * Returns null for empty input so callers can distinguish "not supplied".
 */
export function toDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value);
  if (typeof value === 'string') return new Decimal(value.trim());
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Decimal(value);
  }
  return null;
}

/** Coerce to Decimal, falling back to 0. */
export function toDecimalOrZero(value) {
  return toDecimal(value) ?? zero;
}

/** Quantize to 2 dp using half-up rounding (matches SQL numeric rounding). */
export function money(value) {
  return toDecimalOrZero(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Sum many values safely. */
export function sumMoney(values = []) {
  return values.reduce((acc, value) => acc.add(toDecimalOrZero(value)), new Decimal(0));
}

/** Amount still owed on an obligation: amountDue - amountPaid (never < 0). */
export function balanceOf(amountDue, amountPaid) {
  const due = money(amountDue);
  const paid = money(amountPaid);
  const balance = due.minus(paid);
  return balance.isNegative() ? new Decimal(0).toDecimalPlaces(MONEY_SCALE) : balance;
}

/** Clamp a payment so it can never exceed the remaining balance of an obligation. */
export function clampToBalance(amount, amountDue, amountPaid) {
  const remaining = balanceOf(amountDue, amountPaid);
  const requested = money(amount);
  return requested.greaterThan(remaining) ? remaining : requested;
}

/**
 * Derive the payment status of an obligation from its numbers.
 *
 * @param {object} params
 * @param {*} params.amountDue
 * @param {*} params.amountPaid
 * @param {boolean} [params.hasPendingSubmission]
 * @param {Date} [params.dueDate]
 * @param {Date} [params.now]
 * @param {boolean} [params.isWaived]
 * @returns {'UNPAID'|'PENDING_VERIFICATION'|'PARTIALLY_PAID'|'PAID'|'OVERDUE'|'WAIVED'}
 */
export function deriveObligationStatus({
  amountDue,
  amountPaid,
  hasPendingSubmission = false,
  dueDate,
  now = new Date(),
  isWaived = false,
}) {
  if (isWaived) return 'WAIVED';

  const due = money(amountDue);
  const paid = money(amountPaid);
  const balance = balanceOf(due, paid);

  if (balance.isZero() || due.isZero()) return 'PAID';
  if (hasPendingSubmission) return 'PENDING_VERIFICATION';

  const overdue =
    dueDate instanceof Date &&
    !Number.isNaN(dueDate.getTime()) &&
    dueDate.getTime() < now.getTime();

  if (overdue) return 'OVERDUE';
  // NOTE: Prisma's Decimal exposes the Decimal.js-lite API. Use the canonical
  // comparison/arithmetic names below (gt, lt, mul, div, plus, minus, isZero,
  // isNegative) - the longer aliases such as `isGreaterThan` / `multipliedBy`
  // do NOT exist and would throw at runtime.
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

/** Is this obligation counted as delinquent (outstanding and past due)? */
export function isDelinquent(status, dueDate, now = new Date()) {
  if (status === 'PAID' || status === 'WAIVED') return false;
  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return false;
  return dueDate.getTime() < now.getTime();
}

/** Number of full days between two dates (b - a), never negative. */
export function daysBetween(a, b = new Date()) {
  if (!(a instanceof Date) || Number.isNaN(a.getTime())) return 0;
  const ms = b.getTime() - a.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

/** Percentage (0-100, one decimal) of the obligation that has been paid. */
export function paidPercentage(amountDue, amountPaid) {
  const due = money(amountDue);
  if (due.isZero()) return 100;
  const paid = money(amountPaid);
  const pct = paid.div(due).mul(100);
  return Math.min(100, Math.max(0, pct.toDecimalPlaces(1).toNumber()));
}

/**
 * Convert a Decimal to a plain JSON-safe number/ string.
 * Prisma Decimal serialises safely already, but helpers and CSV exports need
 * explicit control.
 */
export function moneyToNumber(value) {
  return money(value).toNumber();
}

export function moneyToString(value) {
  return money(value).toFixed(MONEY_SCALE);
}

/** Format for display with the Philippine Peso sign (default). */
export function formatPeso(value) {
  const n = moneyToNumber(value);
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export { Decimal, zero };