import { prisma } from './prisma';

/**
 * ---------------------------------------------------------------------------
 * System settings
 * ---------------------------------------------------------------------------
 * Values live in the `SystemSetting` table so an administrator can change club
 * configuration (dues amount, member-ID format, session lifetime) without a
 * redeploy. Reads are memoised per-process to avoid hammering Postgres on every
 * dashboard render.
 */

export const SETTING_KEYS = {
  CLUB_NAME: 'club.name',
  CLUB_SHORT_NAME: 'club.short_name',
  CLUB_ADDRESS: 'club.address',
  CLUB_CONTACT: 'club.contact',
  CLUB_EMAIL: 'club.email',
  MEMBER_ID_PREFIX: 'members.id_prefix',
  MEMBER_ID_SEQUENCE: 'members.id_sequence',
  DEFAULT_DUES_AMOUNT: 'finance.default_dues_amount',
  DUES_DUE_DAY: 'finance.dues_due_day',
  CURRENCY: 'finance.currency',
  OPENING_BALANCE: 'finance.opening_balance',
  OPENING_BALANCE_DATE: 'finance.opening_balance_date',
  ATTENDANCE_WINDOW_DAYS: 'attendance.window_days',
  ALLOW_SELF_RECORD: 'attendance.allow_self_record',
  SESSION_HOURS: 'security.session_hours',
  LOGIN_MAX_ATTEMPTS: 'security.login_max_attempts',
  LOGIN_LOCKOUT_MINUTES: 'security.login_lockout_minutes',
};

/** Defaults applied by the seed script and used when a row is missing. */
export const SETTING_DEFAULTS = {
  [SETTING_KEYS.CLUB_NAME]: {
    value: 'Centro Sugbo Eagles Club',
    valueType: 'STRING',
    category: 'club',
    label: 'Club Name',
    description: 'Displayed in the header, reports and printed minutes.',
  },
  [SETTING_KEYS.CLUB_SHORT_NAME]: {
    value: 'CSEC',
    valueType: 'STRING',
    category: 'club',
    label: 'Club Short Name',
    description: 'Short form used in the sidebar and page titles.',
  },
  [SETTING_KEYS.CLUB_ADDRESS]: {
    value: 'Centro Sugbo, Cebu, Philippines',
    valueType: 'STRING',
    category: 'club',
    label: 'Club Address',
    description: 'Club headquarters address shown on printed documents.',
  },
  [SETTING_KEYS.CLUB_CONTACT]: {
    value: '+63 000 000 0000',
    valueType: 'STRING',
    category: 'club',
    label: 'Club Contact Number',
    description: 'Contact number printed on official documents.',
  },
  [SETTING_KEYS.CLUB_EMAIL]: {
    value: 'secretary@centrosugboeaglesclub.local',
    valueType: 'STRING',
    category: 'club',
    label: 'Club Email',
    description: 'Official email address of the club.',
  },
  [SETTING_KEYS.MEMBER_ID_PREFIX]: {
    value: 'CSEC',
    valueType: 'STRING',
    category: 'members',
    label: 'Member ID Prefix',
    description: 'Prefix for generated member numbers, e.g. CSEC-2024-0001.',
  },
  [SETTING_KEYS.MEMBER_ID_SEQUENCE]: {
    value: '0',
    valueType: 'NUMBER',
    category: 'members',
    label: 'Member ID Sequence',
    description: 'Last number issued. The Secretary can reset it if needed.',
  },
  [SETTING_KEYS.DEFAULT_DUES_AMOUNT]: {
    value: '200.00',
    valueType: 'STRING',
    category: 'finance',
    label: 'Default Monthly Dues',
    description: 'Amount used when generating monthly dues obligations.',
  },
  [SETTING_KEYS.DUES_DUE_DAY]: {
    value: '10',
    valueType: 'NUMBER',
    category: 'finance',
    label: 'Monthly Dues Due Day',
    description: 'Day of the month dues are due (1-28).',
  },
  [SETTING_KEYS.CURRENCY]: {
    value: 'PHP',
    valueType: 'STRING',
    category: 'finance',
    label: 'Currency',
    description: 'ISO currency code used in reports.',
  },
  [SETTING_KEYS.OPENING_BALANCE]: {
    value: '0.00',
    valueType: 'STRING',
    category: 'finance',
    label: 'Opening Cash Balance',
    description: 'Starting balance used by the cash-flow report.',
  },
  [SETTING_KEYS.OPENING_BALANCE_DATE]: {
    value: '',
    valueType: 'STRING',
    category: 'finance',
    label: 'Opening Balance Date',
    description: 'Date the opening balance applies (YYYY-MM-DD).',
  },
  [SETTING_KEYS.ATTENDANCE_WINDOW_DAYS]: {
    value: '7',
    valueType: 'NUMBER',
    category: 'attendance',
    label: 'Attendance Request Window',
    description: 'Days after an event during which members may still submit PRESENT.',
  },
  [SETTING_KEYS.ALLOW_SELF_RECORD]: {
    value: 'false',
    valueType: 'BOOLEAN',
    category: 'attendance',
    label: 'Allow Manual Self-Recording',
    description: 'When true, officers may record their own attendance manually.',
  },
  [SETTING_KEYS.SESSION_HOURS]: {
    value: String(Number(process.env.SESSION_MAX_AGE_HOURS ?? 8)),
    valueType: 'NUMBER',
    category: 'security',
    label: 'Session Lifetime (hours)',
    description: 'Users are signed out automatically after this many hours.',
  },
  [SETTING_KEYS.LOGIN_MAX_ATTEMPTS]: {
    value: String(Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 5)),
    valueType: 'NUMBER',
    category: 'security',
    label: 'Max Failed Logins',
    description: 'Failed attempts before the account is temporarily locked.',
  },
  [SETTING_KEYS.LOGIN_LOCKOUT_MINUTES]: {
    value: String(Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15)),
    valueType: 'NUMBER',
    category: 'security',
    label: 'Lockout Duration (minutes)',
    description: 'How long an account stays locked after too many failures.',
  },
};

const cache = new Map();

export async function getSetting(key, fallback = null) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const value = row ? row.value : (SETTING_DEFAULTS[key]?.value ?? fallback);
    cache.set(key, { value: value ?? fallback, expiresAt: Date.now() + 30_000 });
    return value ?? fallback;
  } catch {
    // Database unreachable (e.g. during a production build) - use defaults.
    return SETTING_DEFAULTS[key]?.value ?? fallback;
  }
}

export async function getSettings(keys) {
  const entries = await Promise.all(keys.map(async (key) => [key, await getSetting(key)]));
  return Object.fromEntries(entries);
}

export function getNumberSetting(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getBooleanSetting(value) {
  return value === true || value === 'true' || value === '1';
}

/** Clears the per-process cache (after a settings update, or in tests). */
export function clearSettingsCache() {
  cache.clear();
}

/** Upsert a setting, recording who changed it. */
export async function setSetting(key, value, userId) {
  validateSetting(key, value);
  const meta = SETTING_DEFAULTS[key] ?? {
    valueType: 'STRING',
    category: 'general',
    label: key,
    description: null,
  };
  const result = await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: String(value ?? ''),
      valueType: meta.valueType,
      category: meta.category,
      label: meta.label,
      description: meta.description,
      updatedById: userId ?? null,
    },
    update: { value: String(value ?? ''), updatedById: userId ?? null },
  });
  cache.set(key, { value: result.value, expiresAt: Date.now() + 30_000 });
  return result;
}

export function validateSetting(key, value) {
  const reject = (message) => { const error = new Error(message); error.name = 'SettingError'; throw error; };
  const meta = SETTING_DEFAULTS[key];
  if (!meta) reject('Unknown system setting.');
  const text = String(value ?? '').trim();
  if (text.length > 500) reject('Setting value is too long.');
  const ranges = {
    [SETTING_KEYS.MEMBER_ID_SEQUENCE]: [0, 999999],
    [SETTING_KEYS.DUES_DUE_DAY]: [1, 28],
    [SETTING_KEYS.ATTENDANCE_WINDOW_DAYS]: [0, 365],
    [SETTING_KEYS.SESSION_HOURS]: [1, 720],
    [SETTING_KEYS.LOGIN_MAX_ATTEMPTS]: [1, 100],
    [SETTING_KEYS.LOGIN_LOCKOUT_MINUTES]: [1, 1440],
  };
  if (ranges[key]) {
    const n = Number(text); const [min, max] = ranges[key];
    if (!text || !Number.isInteger(n) || n < min || n > max) reject(`Enter a whole number between ${min} and ${max}.`);
  }
  if (meta.valueType === 'BOOLEAN' && !['true', 'false'].includes(text)) reject('Choose true or false.');
  if ([SETTING_KEYS.DEFAULT_DUES_AMOUNT, SETTING_KEYS.OPENING_BALANCE].includes(key) && !/^\d{1,10}(\.\d{1,2})?$/.test(text)) reject('Enter a non-negative amount with at most two decimal places.');
  if (key === SETTING_KEYS.MEMBER_ID_PREFIX && !/^[A-Za-z0-9]{2,10}$/.test(text)) reject('Use 2 to 10 letters or numbers for the prefix.');
  if (key === SETTING_KEYS.CURRENCY && !/^[A-Z]{3}$/.test(text)) reject('Enter a three-letter currency code.');
  if (key === SETTING_KEYS.CLUB_NAME && !text) reject('Club name is required.');
}
