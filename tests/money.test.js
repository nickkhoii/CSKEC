import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  balanceOf,
  clampToBalance,
  daysBetween,
  deriveObligationStatus,
  formatPeso,
  isDelinquent,
  money,
  moneyToNumber,
  moneyToString,
  paidPercentage,
  sumMoney,
  toDecimal,
} from '@/lib/money';

const D = (value) => new Prisma.Decimal(value);

describe('money - Decimal coercion', () => {
  it('accepts strings, numbers and Decimals', () => {
    expect(moneyToString(toDecimal('200'))).toBe('200.00');
    expect(moneyToString(toDecimal(200.5))).toBe('200.50');
    expect(moneyToString(toDecimal(D('199.99')))).toBe('199.99');
  });

  it('returns null for empty input and falls back to zero', () => {
    expect(toDecimal('')).toBeNull();
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(moneyToString(toDecimal(null))).toBe('0.00');
  });

  it('rejects NaN and Infinity rather than corrupting the ledger', () => {
    expect(toDecimal(NaN)).toBeNull();
    expect(toDecimal(Infinity)).toBeNull();
  });
});

describe('money - rounding is half-up at 2dp, never float drift', () => {
  it('quantizes to two decimals', () => {
    expect(moneyToString(money('1.005'))).toBe('1.01');
    expect(moneyToString(money('1.004'))).toBe('1.00');
    expect(moneyToString(money('0.1'))).toBe('0.10');
  });

  it('avoids the classic float error that breaks 0.1 + 0.2', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754; Decimal must not reproduce it.
    expect(moneyToString(sumMoney(['0.10', '0.20']))).toBe('0.30');
  });

  it('sums many values exactly', () => {
    expect(moneyToString(sumMoney(['0.10', '0.20', '0.30']))).toBe('0.60');
    expect(moneyToString(sumMoney([]))).toBe('0.00');
  });
});

describe('money - balance and clamping', () => {
  it('computes the outstanding balance', () => {
    expect(moneyToString(balanceOf('200.00', '0.00'))).toBe('200.00');
    expect(moneyToString(balanceOf('200.00', '50.00'))).toBe('150.00');
    expect(moneyToString(balanceOf('200.00', '200.00'))).toBe('0.00');
  });

  it('never returns a negative balance', () => {
    expect(moneyToString(balanceOf('200.00', '250.00'))).toBe('0.00');
  });

  it('clamps a payment to the remaining balance', () => {
    expect(moneyToString(clampToBalance('500.00', '200.00', '50.00'))).toBe('150.00');
    expect(moneyToString(clampToBalance('40.00', '200.00', '50.00'))).toBe('40.00');
  });
});

describe('money - obligation status derivation', () => {
  const dueDate = new Date('2030-06-10');
  const past = new Date('2020-01-10');

  it('is PAID when nothing is outstanding', () => {
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '200.00', dueDate })).toBe('PAID');
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '200.00', dueDate, isWaived: true })).toBe('WAIVED');
    expect(deriveObligationStatus({ amountDue: '0.00', amountPaid: '0.00', dueDate })).toBe('PAID');
  });

  it('honours a waiver above everything else', () => {
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '0.00', isWaived: true })).toBe('WAIVED');
  });

  it('is PENDING_VERIFICATION while a submission is awaiting the Treasurer', () => {
    expect(
      deriveObligationStatus({ amountDue: '200.00', amountPaid: '0.00', hasPendingSubmission: true, dueDate }),
    ).toBe('PENDING_VERIFICATION');
  });

  it('is PARTIALLY_PAID when some money is in and nothing is pending', () => {
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '50.00', dueDate })).toBe('PARTIALLY_PAID');
  });

  it('is OVERDUE past the due date', () => {
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '0.00', dueDate: past })).toBe('OVERDUE');
  });

  it('is UNPAID before the due date', () => {
    expect(deriveObligationStatus({ amountDue: '200.00', amountPaid: '0.00', dueDate })).toBe('UNPAID');
  });

  it('stays PARTIALLY_PAID (not OVERDUE) while a submission is pending', () => {
    expect(
      deriveObligationStatus({
        amountDue: '200.00',
        amountPaid: '50.00',
        hasPendingSubmission: true,
        dueDate: past,
      }),
    ).toBe('PENDING_VERIFICATION');
  });
});

describe('money - delinquency and progress helpers', () => {
  const now = new Date('2026-05-01');

  it('flags only outstanding, past-due obligations', () => {
    expect(isDelinquent('OVERDUE', new Date('2026-04-01'), now)).toBe(true);
    expect(isDelinquent('PARTIALLY_PAID', new Date('2026-04-01'), now)).toBe(true);
    expect(isDelinquent('PAID', new Date('2026-04-01'), now)).toBe(false);
    expect(isDelinquent('WAIVED', new Date('2026-04-01'), now)).toBe(false);
    expect(isDelinquent('UNPAID', new Date('2026-06-01'), now)).toBe(false);
  });

  it('computes the paid percentage, clamped to 0-100', () => {
    expect(paidPercentage('200.00', '200.00')).toBe(100);
    expect(paidPercentage('200.00', '50.00')).toBe(25);
    expect(paidPercentage('200.00', '0.00')).toBe(0);
    expect(paidPercentage('200.00', '250.00')).toBe(100);
    expect(paidPercentage('0.00', '0.00')).toBe(100);
  });

  it('counts whole days between dates, never negative', () => {
    expect(daysBetween(new Date('2026-05-01'), new Date('2026-05-11'))).toBe(10);
    expect(daysBetween(new Date('2026-05-11'), new Date('2026-05-01'))).toBe(0);
  });

  it('formats peso amounts for display', () => {
    expect(formatPeso('1234.5')).toBe('\u20B11,234.50');
    expect(formatPeso(null)).toBe('\u20B10.00');
    expect(moneyToNumber(money('10.25'))).toBe(10.25);
  });
});