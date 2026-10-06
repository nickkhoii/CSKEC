import { prisma } from './prisma';
import { SETTING_KEYS, getNumberSetting, getSetting, setSetting } from './settings';

/**
 * ---------------------------------------------------------------------------
 * Member ID generation
 * ---------------------------------------------------------------------------
 * Format is configurable: `PREFIX-YYYY-NNNN` (default `CSEC-2024-0001`).
 *
 * The sequence is stored in SystemSetting and incremented inside a transaction.
 * Because `Member.memberNumber` also carries a UNIQUE constraint, two concurrent
 * registrations can never end up with the same ID - the loser of the race gets a
 * clear "already taken" error rather than a duplicate record.
 */

/** Build the display form of a member number. */
export function formatMemberNumber(prefix, year, sequence, padding = 4) {
  return `${prefix}-${year}-${String(sequence).padStart(padding, '0')}`;
}

/**
 * Atomically reserve the next member number.
 *
 * @returns {Promise<{ memberNumber: string, sequence: number, year: number }>}
 */
export async function reserveMemberNumber({ year = new Date().getFullYear(), tx: existingTx } = {}) {
  const prefix = existingTx
    ? (await existingTx.systemSetting.findUnique({ where: { key: SETTING_KEYS.MEMBER_ID_PREFIX } }))?.value || 'CSEC'
    : (await getSetting(SETTING_KEYS.MEMBER_ID_PREFIX, 'CSEC')) || 'CSEC';

  const reserve = async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17001)`;
    const settingKey = SETTING_KEYS.MEMBER_ID_SEQUENCE;
    const current = await tx.systemSetting.findUnique({ where: { key: settingKey } });

    // Read-modify-write inside the transaction keeps the counter serialised.
    let nextSequence = getNumberSetting(current?.value, 0) + 1;
    while (await tx.member.findUnique({ where: { memberNumber: formatMemberNumber(prefix, year, nextSequence) }, select: { id: true } })) nextSequence += 1;

    await tx.systemSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: String(nextSequence),
        valueType: 'NUMBER',
        category: 'members',
        label: 'Member ID Sequence',
      },
      update: { value: String(nextSequence) },
    });

    return {
      memberNumber: formatMemberNumber(prefix, year, nextSequence),
      sequence: nextSequence,
      year,
    };
  };
  return existingTx ? reserve(existingTx) : prisma.$transaction(reserve);
}

/**
 * Finds a free member number without permanently consuming the counter.
 * Used to preview the next ID on the member-registration form.
 */
export async function previewNextMemberNumber(year = new Date().getFullYear()) {
  const prefix = (await getSetting(SETTING_KEYS.MEMBER_ID_PREFIX, 'CSEC')) || 'CSEC';
  const sequence = getNumberSetting(await getSetting(SETTING_KEYS.MEMBER_ID_SEQUENCE), 0);

  // Skip any numbers already taken (e.g. after a manual import).
  for (let offset = 1; offset <= 50; offset += 1) {
    const candidate = formatMemberNumber(prefix, year, sequence + offset);
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.member.findUnique({
      where: { memberNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return formatMemberNumber(prefix, year, sequence + 1);
}

/** True when the value looks like a member number we can accept. */
export function isValidMemberNumber(value) {
  return /^[A-Za-z0-9]{2,10}-\d{4}-\d{1,6}$/.test(String(value ?? '').trim());
}

/** Resets the counter (System Administrator only). */
export async function resetMemberNumberSequence(value, userId) {
  const numeric = getNumberSetting(value, 0);
  await setSetting(SETTING_KEYS.MEMBER_ID_SEQUENCE, String(Math.max(0, numeric)), userId);
  return numeric;
}
