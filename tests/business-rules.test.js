import { describe, it, expect } from 'vitest';
import { evaluateRequestEligibility } from '@/lib/attendance';
import { buildDedupeKey } from '@/lib/finance';
import { rowsToCsv, escapeCsvField, escapeCsvValue, reportFilename } from '@/lib/csv';
import { formatMemberNumber, isValidMemberNumber } from '@/lib/member-id';
import { sanitizeMetadata } from '@/lib/audit';
import {
  safeRedirectPath,
  parsePagination,
  totalPages,
  buildQueryString,
  slugify,
  normalizeEmail,
} from '@/lib/utils';

const DAY = 86_400_000;

const activity = (overrides = {}) => ({
  id: 'act-1',
  title: 'General Assembly',
  status: 'PUBLISHED',
  requiresAttendance: true,
  startsAt: new Date(Date.now() - 2 * DAY),
  endsAt: new Date(Date.now() - 2 * DAY + 2 * 60 * 60 * 1000),
  ...overrides,
});

describe('attendance - eligibility rules', () => {
  it('allows a fresh request on an open activity', () => {
    expect(evaluateRequestEligibility({ activity: activity(), existingRequest: null, record: null }).allowed).toBe(true);
  });

  it('blocks a duplicate request while one is pending', () => {
    const result = evaluateRequestEligibility({
      activity: activity(),
      existingRequest: { status: 'PENDING' },
      record: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/pending request/i);
  });

  it('blocks once attendance is officially recorded', () => {
    const result = evaluateRequestEligibility({
      activity: activity(),
      existingRequest: { status: 'APPROVED' },
      record: { status: 'PRESENT' },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already officially recorded/i);
  });

  it('lets a REJECTED member re-submit (re-open, never duplicate)', () => {
    const result = evaluateRequestEligibility({
      activity: activity(),
      existingRequest: { status: 'REJECTED' },
      record: null,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks an unpublished activity', () => {
    expect(evaluateRequestEligibility({ activity: activity({ status: 'DRAFT' }), record: null }).allowed).toBe(false);
  });

  it('blocks an activity that does not require attendance', () => {
    expect(evaluateRequestEligibility({ activity: activity({ requiresAttendance: false }), record: null }).allowed).toBe(false);
  });

  it('closes the window after the configured number of days', () => {
    const old = activity({
      startsAt: new Date(Date.now() - 30 * DAY),
      endsAt: new Date(Date.now() - 30 * DAY),
    });
    expect(evaluateRequestEligibility({ activity: old, record: null, windowDays: 7 }).allowed).toBe(false);
    expect(evaluateRequestEligibility({ activity: old, record: null, windowDays: 60 }).allowed).toBe(true);
  });

  it('blocks a missing activity', () => {
    expect(evaluateRequestEligibility({ activity: null }).allowed).toBe(false);
  });
});

describe('finance - obligation dedupe keys', () => {
  const base = { type: 'MONTHLY_DUES', memberId: 'm1', periodYear: 2026, periodMonth: 5 };

  it('is stable for the same member + period', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
  });

  it('differs across members, periods and activity fees', () => {
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, memberId: 'm2' }));
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, periodMonth: 6 }));
    expect(buildDedupeKey({ type: 'COMMUNITY_SERVICE', memberId: 'm1', activityId: 'a1' })).not.toBe(
      buildDedupeKey({ type: 'COMMUNITY_SERVICE', memberId: 'm1', activityId: 'a2' }),
    );
  });

  it('pads single-digit months', () => {
    expect(buildDedupeKey({ ...base, periodMonth: 1 })).toContain('2026-01');
  });

  it('handles a period-less obligation', () => {
    expect(buildDedupeKey({ type: 'OTHER_FEE', memberId: 'm1' })).toBe('OTHER_FEE:m1:NA:NA');
  });
});

describe('csv - export safety', () => {
  const columns = [
    { key: 'name', label: 'Member' },
    { key: 'balance', label: 'Balance', map: (r) => `PHP ${r.balance}` },
  ];

  it('writes a header and rows', () => {
    const csv = rowsToCsv(columns, [{ name: 'Ana', balance: '100.00' }]);
    expect(csv).toContain('Member,Balance');
    expect(csv).toContain('Ana,PHP 100.00');
  });

  it('emits only the header when there are no rows', () => {
    expect(rowsToCsv(columns, [])).toBe('Member,Balance');
  });

  it('quotes and escapes values containing commas, quotes or newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A member name like "=1+1" must never execute when opened in Excel.
    expect(escapeCsvValue('=1+1')).toBe("'=1+1");
    expect(escapeCsvValue('+1')).toBe("'+1");
    expect(escapeCsvValue('-1')).toBe("'-1");
    expect(escapeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('builds a safe, dated filename', () => {
    expect(reportFilename('Member Master List')).toMatch(/^member-master-list-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('member id - generation rules', () => {
  it('formats PREFIX-YYYY-NNNN', () => {
    expect(formatMemberNumber('CSEC', 2024, 1)).toBe('CSEC-2024-0001');
    expect(formatMemberNumber('CSEC', 2024, 42)).toBe('CSEC-2024-0042');
  });

  it('accepts well-formed and rejects malformed member numbers', () => {
    expect(isValidMemberNumber('CSEC-2024-0001')).toBe(true);
    expect(isValidMemberNumber('nonsense')).toBe(false);
    expect(isValidMemberNumber('')).toBe(false);
  });
});

describe('audit - metadata scrubbing', () => {
  it('removes credential-like keys at any depth', () => {
    const scrubbed = sanitizeMetadata({
      email: 'a@b.com',
      password: 'super-secret',
      nested: { token: 'abc', newPassword: 'x', keep: 'yes' },
    });
    expect(scrubbed.password).toBeUndefined();
    expect(scrubbed.nested.token).toBeUndefined();
    expect(scrubbed.nested.newPassword).toBeUndefined();
    expect(scrubbed.nested.keep).toBe('yes');
    expect(scrubbed.email).toBe('a@b.com');
  });

  it('converts Decimals to strings and truncates long strings', () => {
    expect(sanitizeMetadata({ amount: { toFixed: () => '10.00', toNumber: () => 10 } })).toEqual({
      amount: '10.00',
    });
    expect(String(sanitizeMetadata({ note: 'x'.repeat(900) })).length).toBeLessThanOrEqual(501);
  });
});

describe('utils - pagination, redirects and slugs', () => {
  it('clamps pagination input', () => {
    expect(parsePagination({ page: '3', pageSize: '25' })).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25,
    });
    expect(parsePagination({ page: '-5', pageSize: '9999' })).toMatchObject({ page: 1, pageSize: 100 });
    expect(parsePagination({})).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('always reports at least one page', () => {
    expect(totalPages(0, 10)).toBe(1);
    expect(totalPages(95, 10)).toBe(10);
  });

  it('blocks open redirects', () => {
    expect(safeRedirectPath('/member/dashboard')).toBe('/member/dashboard');
    expect(safeRedirectPath('https://evil.example/x')).toBe('/dashboard');
    expect(safeRedirectPath('//evil.example')).toBe('/dashboard');
    expect(safeRedirectPath('/login')).toBe('/dashboard');
    expect(safeRedirectPath('/\\evil.example')).toBe('/dashboard');
  });

  it('builds query strings, dropping empty values', () => {
    expect(buildQueryString({ page: 2, q: '', status: null })).toBe('?page=2');
    expect(buildQueryString({})).toBe('');
  });

  it('slugifies titles and normalises emails', () => {
    expect(slugify('General Membership Meeting!')).toBe('general-membership-meeting');
    expect(slugify('   ')).toBe('item');
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });
});