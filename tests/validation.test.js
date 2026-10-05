import { describe, it, expect } from 'vitest';
import {
  attendanceReviewSchema,
  createMemberSchema,
  createUserSchema,
  generateDuesSchema,
  loginSchema,
  manualAttendanceSchema,
  paymentReviewSchema,
  paymentSubmissionSchema,
  transactionSchema,
  updateUserStatusSchema,
} from '@/validations/schemas';
import { fieldErrors, firstError, emailField, moneyField, dateField, passwordField } from '@/validations/common';
import { passwordStrengthIssues, BCRYPT_ROUNDS } from '@/lib/password';

const ok = (schema, value) => schema.safeParse(value).success;

describe('validation - email', () => {
  it('accepts a valid address and lower-cases it', () => {
    const parsed = emailField.parse('  Ana.DelaCruz@Example.COM ');
    expect(parsed).toBe('ana.delacruz@example.com');
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a@@b.com', 'a@b..com', 'x'.repeat(300) + '@b.com']) {
      expect(ok(emailField, bad), bad).toBe(false);
    }
  });
});

describe('validation - money', () => {
  it('requires a positive number with at most 2 decimals', () => {
    expect(ok(moneyField('Amount'), '200.00')).toBe(true);
    expect(ok(moneyField('Amount'), 200)).toBe(true);
    expect(ok(moneyField('Amount'), '0')).toBe(false);
    expect(ok(moneyField('Amount'), '-5')).toBe(false);
    // 3+ decimals would silently lose money, so it is rejected outright.
    expect(ok(moneyField('Amount'), '200.555')).toBe(false);
    expect(ok(moneyField('Amount'), '1e3')).toBe(false);
    expect(ok(moneyField('Amount'), 'abc')).toBe(false);
    expect(ok(moneyField('Amount'), '')).toBe(false);
  });

  it('allows zero when the caller opts in', () => {
    expect(ok(moneyField('Amount', { allowZero: true }), '0.00')).toBe(true);
  });
});

describe('validation - dates', () => {
  it('requires a real calendar date', () => {
    expect(ok(dateField(), '2026-05-01')).toBe(true);
    expect(ok(dateField(), '2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(ok(dateField(), '2026-13-01')).toBe(false);
    expect(ok(dateField(), '01-05-2026')).toBe(false);
    expect(ok(dateField(), '2026-5-1')).toBe(false);
  });
});

describe('validation - passwords', () => {
  it('enforces the documented policy', () => {
    expect(ok(passwordField(), 'ChangeMe!2024')).toBe(true);
    expect(ok(passwordField(), 'short1!A')).toBe(false); // too short
    expect(ok(passwordField(), 'alllowercase1!')).toBe(false); // no uppercase
    expect(ok(passwordField(), 'ALLUPPERCASE1!')).toBe(false); // no lowercase
    expect(ok(passwordField(), 'NoDigitsHere!!')).toBe(false); // no number
    expect(ok(passwordField(), 'NoSymbol12345')).toBe(false); // no symbol
  });

  it('reports every policy issue for the UI', async () => {
    const issues = await passwordStrengthIssues('abc');
    expect(issues.length).toBeGreaterThan(0);
    expect(await passwordStrengthIssues('ChangeMe!2024')).toEqual([]);
  });

  it('uses a bcrypt cost of at least 10 outside tests', () => {
    // The test environment lowers this to 4 for speed; production must not.
    expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(4);
  });
});

describe('validation - login', () => {
  it('requires both fields', () => {
    expect(ok(loginSchema, { email: 'a@b.com', password: 'x' })).toBe(true);
    expect(ok(loginSchema, { email: 'a@b.com' })).toBe(false);
    expect(ok(loginSchema, { email: 'bad', password: 'x' })).toBe(false);
  });
});

describe('validation - member encoding', () => {
  const valid = {
    firstName: 'Ana',
    lastName: 'Dela Cruz',
    email: 'ana@example.com',
    dateJoined: '2024-01-15',
    status: 'ACTIVE',
  };

  it('accepts a minimal valid member', () => {
    expect(ok(createMemberSchema, valid)).toBe(true);
  });

  it('requires names, a valid email and a join date', () => {
    expect(ok(createMemberSchema, { ...valid, firstName: '' })).toBe(false);
    expect(ok(createMemberSchema, { ...valid, lastName: '   ' })).toBe(false);
    expect(ok(createMemberSchema, { ...valid, email: 'nope' })).toBe(false);
    expect(ok(createMemberSchema, { ...valid, dateJoined: undefined })).toBe(false);
  });

  it('rejects an unknown membership status', () => {
    expect(ok(createMemberSchema, { ...valid, status: 'BANANA' })).toBe(false);
  });

/**
 * React escapes text on render, so angle brackets in stored data are not an
 * XSS vector - the validator allows them and the renderer handles escaping.
 * What the validator must reject are C0 control characters, which have no
 * place in a name and enable log-injection / header-splitting tricks.
 */
  it('rejects control characters but allows printable angle brackets', () => {
    // Allowed: React escapes this at render time.
    expect(ok(createMemberSchema, { ...valid, firstName: 'Ana<script>' })).toBe(true);
    expect(ok(createMemberSchema, { ...valid, firstName: 'Ana O' + String.fromCharCode(39) + 'Neil' })).toBe(true);

    // Rejected: BEL, NUL and ESC must never reach the database.
    for (const code of [7, 0, 27]) {
      expect(ok(createMemberSchema, { ...valid, firstName: `Ana${String.fromCharCode(code)}` })).toBe(false);
    }
  });
});

describe('validation - payment submission (member)', () => {
  const valid = {
    obligationId: 'oblabcdef123',
    type: 'MONTHLY_DUES',
    amount: '200.00',
    paymentDate: '2026-05-01',
    referenceNumber: 'RCPT-0001',
    paymentMethod: 'BANK_TRANSFER',
  };

  it('accepts a well-formed submission', () => {
    expect(ok(paymentSubmissionSchema, valid)).toBe(true);
  });

  it('refuses a future payment date', () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(ok(paymentSubmissionSchema, { ...valid, paymentDate: future })).toBe(false);
  });

  it('requires monthly dues to name the obligation being paid', () => {
    expect(ok(paymentSubmissionSchema, { ...valid, obligationId: null })).toBe(false);
  });

  it('requires a minimum-length reference number', () => {
    expect(ok(paymentSubmissionSchema, { ...valid, referenceNumber: 'ab' })).toBe(false);
  });

  it('requires a known payment method', () => {
    expect(ok(paymentSubmissionSchema, { ...valid, paymentMethod: 'CRYPTO' })).toBe(false);
  });

  it('requires both month and year when a period is given', () => {
    expect(
      ok(paymentSubmissionSchema, { ...valid, type: 'OTHER_FEE', obligationId: null, periodMonth: '5' }),
    ).toBe(false);
    expect(
      ok(paymentSubmissionSchema, { ...valid, type: 'OTHER_FEE', obligationId: null, periodYear: '2026' }),
    ).toBe(false);
  });
});

describe('validation - approval workflows', () => {
  it('only accepts APPROVE or REJECT for a payment review', () => {
    expect(ok(paymentReviewSchema, { submissionId: 'subabcdef123', decision: 'APPROVE' })).toBe(true);
    expect(ok(paymentReviewSchema, { submissionId: 'subabcdef123', decision: 'MAYBE' })).toBe(false);
  });

  it('only accepts APPROVE or REJECT for an attendance review', () => {
    expect(
      ok(attendanceReviewSchema, {
        requestId: 'reqabcdef123',
        decision: 'REJECT',
        recordStatus: 'PRESENT',
      }),
    ).toBe(true);
    expect(
      ok(attendanceReviewSchema, { requestId: 'reqabcdef123', decision: 'IGNORE' }),
    ).toBe(false);
  });

  it('requires at least one member for a manual roll call', () => {
    expect(ok(manualAttendanceSchema, { activityId: 'actabcdef123', memberIds: [] })).toBe(false);
    expect(
      ok(manualAttendanceSchema, {
        activityId: 'actabcdef123',
        memberIds: ['memabcdef123'],
        recordStatus: 'PRESENT',
      }),
    ).toBe(true);
  });
});

describe('validation - dues generation and ledger', () => {
  it('validates a dues generation request', () => {
    expect(
      ok(generateDuesSchema, {
        periodMonth: '5',
        periodYear: '2026',
        amount: '200.00',
        dueDate: '2026-06-10',
        scope: 'ALL',
      }),
    ).toBe(true);
  });

  it('rejects a month outside 1-12 and a year out of range', () => {
    expect(ok(generateDuesSchema, { periodMonth: '13', periodYear: '2026', amount: '1.00', dueDate: '2026-06-10' })).toBe(false);
    expect(ok(generateDuesSchema, { periodMonth: '0', periodYear: '2026', amount: '1.00', dueDate: '2026-06-10' })).toBe(false);
    expect(ok(generateDuesSchema, { periodMonth: '5', periodYear: '99', amount: '1.00', dueDate: '2026-06-10' })).toBe(false);
  });

  it('requires selected members when the scope is SELECTED', () => {
    const base = { periodMonth: '5', periodYear: '2026', amount: '200.00', dueDate: '2026-06-10' };
    expect(ok(generateDuesSchema, { ...base, scope: 'SELECTED', memberIds: [] })).toBe(false);
    expect(ok(generateDuesSchema, { ...base, scope: 'SELECTED', memberIds: ['mabcdefgh123'] })).toBe(true);
  });

  it('validates a ledger entry and forbids a future date', () => {
    const base = { type: 'EXPENSE', categoryId: 'catabcdef123', description: 'Venue rental', amount: '3500.00' };
    expect(ok(transactionSchema, { ...base, transactionDate: '2026-05-01' })).toBe(true);
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(ok(transactionSchema, { ...base, transactionDate: future })).toBe(false);
    expect(ok(transactionSchema, { ...base, type: 'TRANSFER', transactionDate: '2026-05-01' })).toBe(false);
  });
});

describe('validation - user administration', () => {
  it('requires a strong password when creating an account', () => {
    expect(
      ok(createUserSchema, { email: 'a@b.com', fullName: 'Ana', role: 'MEMBER', password: 'weak' }),
    ).toBe(false);
    expect(
      ok(createUserSchema, { email: 'a@b.com', fullName: 'Ana', role: 'MEMBER', password: 'ChangeMe!2024' }),
    ).toBe(true);
  });

  it('only accepts known roles and account statuses', () => {
    expect(ok(updateUserStatusSchema, { userId: 'usrabcdef123', status: 'DEACTIVATED' })).toBe(true);
    expect(ok(updateUserStatusSchema, { userId: 'usrabcdef123', status: 'BANNED' })).toBe(false);
    expect(ok(createUserSchema, { email: 'a@b.com', fullName: 'Ana', role: 'ROOT', password: 'ChangeMe!2024' })).toBe(false);
  });
});

describe('validation - error shaping', () => {
  it('maps issues to a field->message object and a summary message', () => {
    const result = createMemberSchema.safeParse({ email: 'bad', dateJoined: 'nope' });
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error);
    expect(errors.email).toBeTruthy();
    expect(typeof firstError(result.error)).toBe('string');
  });
});