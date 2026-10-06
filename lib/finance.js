import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { balanceOf, deriveObligationStatus, money } from './money';

/**
 * ---------------------------------------------------------------------------
 * Finance service
 * ---------------------------------------------------------------------------
 * Every function that moves money runs inside `prisma.$transaction`, so the
 * obligation, the payment, the ledger entry and the submission status either all
 * commit together or none do. All amounts are Decimal - never floats.
 */

export class FinanceError extends Error {
  constructor(message, code = 'FINANCE_ERROR') {
    super(message);
    this.name = 'FinanceError';
    this.code = code;
  }
}

/**
 * Deterministic uniqueness key for an obligation. Re-running dues generation for
 * the same member + period can never create a second row because the key is a
 * pure function of those inputs.
 */
export function buildDedupeKey({ type, memberId, periodYear, periodMonth, activityId }) {
  const period =
    periodYear && periodMonth ? `${periodYear}-${String(periodMonth).padStart(2, '0')}` : 'NA';
  return `${type}:${memberId}:${period}:${activityId ?? 'NA'}`;
}

/** Sequential human-readable reference, e.g. PAY-2026-0042. */
async function nextReference(tx, model, field, prefix, year) {
  const count = await tx[model].count({
    where: { [field]: { startsWith: `${prefix}-${year}-` } },
  });
  // The UNIQUE index on the column is the real guard; callers surface a
  // collision as a retryable error.
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}

function statusIsOpen(status) {
  return status !== 'PAID' && status !== 'WAIVED';
}

/**
 * Recomputes amountPaid / balance / status from the Payment rows attached to an
 * obligation and persists the result. The arithmetic itself is pure (lib/money).
 */
export async function refreshObligation(tx, obligationId) {
  const obligation = await tx.financialObligation.findUnique({
    where: { id: obligationId },
    select: {
      id: true,
      amountDue: true,
      dueDate: true,
      status: true,
      waivedAt: true,
    },
  });
  if (!obligation) throw new FinanceError('That obligation does not exist.', 'NOT_FOUND');

  const [payments, pending] = await Promise.all([
    tx.payment.findMany({ where: { obligationId, transaction: { status: 'POSTED' } }, select: { amount: true } }),
    tx.paymentSubmission.count({
      where: { obligationId, status: 'PENDING_VERIFICATION' },
    }),
  ]);

  const paid = money(
    payments.reduce((acc, p) => acc.add(money(p.amount)), new Prisma.Decimal(0)),
  );
  const balance = balanceOf(obligation.amountDue, paid);
  const status = deriveObligationStatus({
    amountDue: obligation.amountDue,
    amountPaid: paid,
    hasPendingSubmission: pending > 0 && statusIsOpen(obligation.status),
    dueDate: obligation.dueDate,
    isWaived: Boolean(obligation.waivedAt),
  });

  return tx.financialObligation.update({
    where: { id: obligationId },
    data: { amountPaid: paid, balance, status },
  });
}

export async function approvePaymentSubmission({ submissionId, reviewer, obligationId, remarks }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17002)`;
    const submission = await tx.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        memberId: true,
        obligationId: true,
        type: true,
        periodMonth: true,
        periodYear: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        referenceNumber: true,
        member: {
          select: { id: true, userId: true, firstName: true, middleName: true, lastName: true },
        },
      },
    });

    if (!submission) throw new FinanceError('That payment submission does not exist.', 'NOT_FOUND');
    if (submission.status !== 'PENDING_VERIFICATION') {
      throw new FinanceError(
        'This submission has already been reviewed. Refresh the page and try again.',
        'ALREADY_REVIEWED',
      );
    }

    // Rule: a Treasurer may never verify their own payment.
    if (reviewer.memberId && reviewer.memberId === submission.memberId) {
      throw new FinanceError(
        'You cannot verify your own payment. Ask another Treasurer to handle it.',
        'SELF_REVIEW',
      );
    }

    const existingPayment = await tx.payment.findUnique({
      where: { submissionId },
      select: { id: true },
    });
    if (existingPayment) {
      throw new FinanceError('A payment already exists for this submission.', 'ALREADY_POSTED');
    }

    const targetObligationId = obligationId ?? submission.obligationId;
    const appliedAmount = money(submission.amount);

    // Guard against over-payment when the submission is bound to an obligation.
    if (targetObligationId) {
      const obligation = await tx.financialObligation.findUnique({
        where: { id: targetObligationId },
        select: {
          id: true,
          memberId: true,
          amountDue: true,
          amountPaid: true,
          status: true,
          title: true,
        },
      });
      if (!obligation) {
        throw new FinanceError('The linked obligation does not exist.', 'NO_OBLIGATION');
      }
      if (obligation.memberId !== submission.memberId) {
        throw new FinanceError(
          'The linked obligation belongs to a different member.',
          'MEMBER_MISMATCH',
        );
      }
      if (obligation.status === 'WAIVED') {
        throw new FinanceError('That obligation has already been waived.', 'WAIVED');
      }
      const remaining = balanceOf(obligation.amountDue, obligation.amountPaid);
      if (appliedAmount.greaterThan(remaining)) {
        throw new FinanceError(
          `The payment exceeds the remaining balance of ${remaining.toFixed(2)} on "${obligation.title}".`,
          'OVERPAY',
        );
      }
    }

    const year = submission.paymentDate.getFullYear();
    const paymentNumber = await nextReference(tx, 'payment', 'paymentNumber', 'PAY', year);

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        memberId: submission.memberId,
        obligationId: targetObligationId,
        submissionId: submission.id,
        amount: appliedAmount,
        paymentDate: submission.paymentDate,
        paymentMethod: submission.paymentMethod,
        referenceNumber: submission.referenceNumber,
        remarks: remarks ?? null,
        isManual: false,
        approvedById: reviewer.id,
        approvedByName: reviewer.name ?? null,
        approvedAt: new Date(),
      },
    });

    // Exactly one ledger entry per payment (`paymentId` is UNIQUE).
    const categoryCode =
      submission.type === 'MONTHLY_DUES'
        ? 'DUES'
        : submission.type === 'COMMUNITY_SERVICE'
          ? 'COMMUNITY_SERVICE'
          : 'OTHER_FEE';
    const category =
      (await tx.transactionCategory.findUnique({ where: { code: categoryCode } })) ??
      (await tx.transactionCategory.findUnique({ where: { code: 'OTHER_FEE' } }));
    if (!category) throw new FinanceError('Income categories are not configured.', 'NO_CATEGORY');

    const periodLabel =
      submission.periodYear && submission.periodMonth
        ? ` ${submission.periodYear}-${String(submission.periodMonth).padStart(2, '0')}`
        : '';
    const transactionNumber = await nextReference(
      tx,
      'financialTransaction',
      'transactionNumber',
      'TXN',
      year,
    );

    const transaction = await tx.financialTransaction.create({
      data: {
        transactionNumber,
        transactionDate: submission.paymentDate,
        type: 'INCOME',
        categoryId: category.id,
        description: `Member payment - ${category.name}${periodLabel}`,
        amount: appliedAmount,
        reference: submission.referenceNumber,
        memberId: submission.memberId,
        paymentId: payment.id,
        recordedById: reviewer.id,
        recordedByName: reviewer.name ?? null,
      },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { transactionId: transaction.id },
    });

    await tx.paymentSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'APPROVED',
        obligationId: targetObligationId,
        reviewedById: reviewer.id,
        reviewedByName: reviewer.name ?? null,
        reviewedAt: new Date(),
        reviewRemarks: remarks ?? null,
      },
    });

    const obligation = targetObligationId ? await refreshObligation(tx, targetObligationId) : null;

    return {
      payment,
      transaction,
      obligation,
      memberUserId: submission.member.userId,
      memberName: `${submission.member.firstName} ${submission.member.lastName}`,
      amount: appliedAmount,
    };
  });
}

/** Rejects a pending submission. No ledger entry is created. */
export async function rejectPaymentSubmission({ submissionId, reviewer, remarks }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17002)`;
    const submission = await tx.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        obligationId: true,
        member: { select: { userId: true } },
      },
    });
    if (!submission) throw new FinanceError('That payment submission does not exist.', 'NOT_FOUND');
    if (submission.status !== 'PENDING_VERIFICATION') {
      throw new FinanceError('This submission has already been reviewed.', 'ALREADY_REVIEWED');
    }

    const updated = await tx.paymentSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        reviewedById: reviewer.id,
        reviewedByName: reviewer.name ?? null,
        reviewedAt: new Date(),
        reviewRemarks: remarks ?? null,
      },
    });

    // The obligation may have been PENDING_VERIFICATION only because of this
    // submission, so recompute now that it is gone.
    if (submission.obligationId) {
      await refreshObligation(tx, submission.obligationId);
    }

    return { submission: updated, memberUserId: submission.member.userId };
  });
}

/** Records an offline/manual payment (cash at the clubhouse) posted by a Treasurer. */
export async function recordManualPayment({
  memberId,
  obligationId,
  amount,
  paymentDate,
  referenceNumber,
  paymentMethod,
  remarks,
  reviewer,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17002)`;
    const duplicate = await tx.payment.findFirst({
      where: { memberId, referenceNumber, isManual: true },
      select: { id: true },
    });
    if (duplicate) {
      throw new FinanceError(
        'A manual payment with that reference number already exists for this member.',
        'DUPLICATE_REFERENCE',
      );
    }

    if (obligationId) {
      const target = await tx.financialObligation.findUnique({ where: { id: obligationId } });
      if (!target || target.memberId !== memberId) throw new FinanceError('Select an obligation belonging to this member.', 'MEMBER_MISMATCH');
      if (target.status === 'WAIVED') throw new FinanceError('That obligation has been waived.', 'WAIVED');
      if (money(amount).greaterThan(balanceOf(target.amountDue, target.amountPaid))) throw new FinanceError('The payment exceeds the remaining balance.', 'OVERPAY');
    }

    const year = paymentDate.getFullYear();
    const paymentNumber = await nextReference(tx, 'payment', 'paymentNumber', 'PAY', year);

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        memberId,
        obligationId: obligationId ?? null,
        amount: money(amount),
        paymentDate,
        paymentMethod,
        referenceNumber,
        remarks: remarks ?? null,
        isManual: true,
        approvedById: reviewer.id,
        approvedByName: reviewer.name ?? null,
        approvedAt: new Date(),
      },
    });

    const category =
      (await tx.transactionCategory.findUnique({ where: { code: 'OTHER_FEE' } })) ??
      (await tx.transactionCategory.findFirst({ where: { type: 'INCOME' } }));
    if (!category) throw new FinanceError('Income categories are not configured.', 'NO_CATEGORY');

    const transactionNumber = await nextReference(
      tx,
      'financialTransaction',
      'transactionNumber',
      'TXN',
      year,
    );
    const transaction = await tx.financialTransaction.create({
      data: {
        transactionNumber,
        transactionDate: paymentDate,
        type: 'INCOME',
        categoryId: category.id,
        description: `Manual member payment (${referenceNumber})`,
        amount: money(amount),
        reference: referenceNumber,
        memberId,
        paymentId: payment.id,
        recordedById: reviewer.id,
        recordedByName: reviewer.name ?? null,
      },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { transactionId: transaction.id },
    });

    const obligation = obligationId ? await refreshObligation(tx, obligationId) : null;
    return { payment, transaction, obligation };
  });
}

/**
 * Generates monthly dues obligations.
 *
 * Idempotent by construction: each obligation is keyed by
 * `buildDedupeKey(member, MONTHLY_DUES, year, month)`, so running this twice for
 * the same period creates nothing the second time.
 */
export async function generateMonthlyDues({
  periodMonth,
  periodYear,
  amount,
  dueDate,
  scope = 'ALL',
  memberIds = [],
  createdById,
  note = null,
}) {
  const dueAmount = money(amount);

  const members = await prisma.member.findMany({
    where: scope === 'ALL' ? { status: 'ACTIVE' } : { status: 'ACTIVE', id: { in: memberIds } },
    select: { id: true },
    orderBy: { memberNumber: 'asc' },
  });

  const title = `Monthly Dues - ${periodYear}-${String(periodMonth).padStart(2, '0')}`;
  const due = new Date(dueDate);

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const dedupeKey = buildDedupeKey({
        type: 'MONTHLY_DUES',
        memberId: member.id,
        periodYear,
        periodMonth,
      });

      // eslint-disable-next-line no-await-in-loop
      const existing = await tx.financialObligation.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await tx.financialObligation.create({
        data: {
          memberId: member.id,
          type: 'MONTHLY_DUES',
          title,
          periodMonth,
          periodYear,
          amountDue: dueAmount,
          amountPaid: new Prisma.Decimal(0),
          balance: dueAmount,
          dueDate: due,
          status: 'UNPAID',
          dedupeKey,
          notes: note,
          createdById: createdById ?? null,
        },
      });
      created += 1;
    }
  });

  return { created, skipped, members: members.length };
}

/** Creates a single ad-hoc obligation (community service fee, other fee, ...). */
export async function createObligation({
  memberId,
  type,
  title,
  description,
  periodMonth,
  periodYear,
  amountDue,
  dueDate,
  activityId,
  notes,
  createdById,
}) {
  const amount = money(amountDue);
  const dedupeKey = buildDedupeKey({
    type,
    memberId,
    periodYear,
    periodMonth,
    activityId,
  });

  const existing = await prisma.financialObligation.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) {
    throw new FinanceError(
      'An identical obligation already exists for this member and period.',
      'DUPLICATE_OBLIGATION',
    );
  }

  return prisma.financialObligation.create({
    data: {
      memberId,
      type,
      title,
      description: description ?? null,
      periodMonth: periodMonth || null,
      periodYear: periodYear || null,
      amountDue: amount,
      amountPaid: new Prisma.Decimal(0),
      balance: amount,
      dueDate: new Date(dueDate),
      status: 'UNPAID',
      activityId: activityId ?? null,
      notes: notes ?? null,
      dedupeKey,
      createdById: createdById ?? null,
    },
  });
}

/**
 * Generates the community-service obligation for every active member (or an
 * explicit subset) from an activity that carries a fee.
 */
export async function generateCommunityServiceObligations({
  activityId,
  amount,
  dueDate,
  createdById,
  scope = 'ALL',
  memberIds = [],
}) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { id: true, title: true, feeAmount: true },
  });
  if (!activity) throw new FinanceError('That activity does not exist.', 'NO_ACTIVITY');

  const fee = money(amount ?? activity.feeAmount ?? 0);
  if (fee.lessThanOrEqualTo(0)) {
    throw new FinanceError('Set a fee amount before generating obligations.', 'NO_FEE');
  }

  const members = await prisma.member.findMany({
    where: scope === 'ALL' ? { status: 'ACTIVE' } : { status: 'ACTIVE', id: { in: memberIds } },
    select: { id: true },
  });

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const member of members) {
      const dedupeKey = buildDedupeKey({
        type: 'COMMUNITY_SERVICE',
        memberId: member.id,
        activityId,
      });
      // eslint-disable-next-line no-await-in-loop
      const existing = await tx.financialObligation.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await tx.financialObligation.create({
        data: {
          memberId: member.id,
          type: 'COMMUNITY_SERVICE',
          title: `Community Service - ${activity.title}`,
          description: 'Community service contribution assessed for this activity.',
          amountDue: fee,
          amountPaid: new Prisma.Decimal(0),
          balance: fee,
          dueDate: new Date(dueDate),
          status: 'UNPAID',
          activityId,
          dedupeKey,
          createdById: createdById ?? null,
        },
      });
      created += 1;
    }
  });

  return { created, skipped, members: members.length };
}

/** Waives an obligation. The row is retained and flagged, never deleted. */
export async function waiveObligation({ obligationId, reason, waivedById }) {
  return prisma.$transaction(async (tx) => {
    const obligation = await tx.financialObligation.findUnique({
      where: { id: obligationId },
      select: { id: true, status: true },
    });
    if (!obligation) throw new FinanceError('That obligation does not exist.', 'NOT_FOUND');
    if (obligation.status === 'WAIVED') {
      throw new FinanceError('That obligation is already waived.', 'ALREADY_WAIVED');
    }

    return tx.financialObligation.update({
      where: { id: obligationId },
      data: {
        status: 'WAIVED',
        waivedAt: new Date(),
        waivedById: waivedById ?? null,
        waiverReason: reason,
      },
    });
  });
}

/**
 * Members with outstanding balances, with the number of overdue months.
 *
 * `overdueMonths` counts MONTHLY_DUES obligations that are past due - this is the
 * figure the Treasurer chases members on.
 */
export async function delinquentMembers({ memberId = null, periodYear = null, periodMonth = null, status = null, limit = 200 } = {}) {
  const now = new Date();

  const where = {
    balance: { gt: 0 },
    status: { not: 'WAIVED' },
    dueDate: { lt: now },
    ...(memberId ? { memberId } : {}),
    ...(status ? { status } : {}),
    ...(periodYear && periodMonth
      ? { periodYear, periodMonth }
      : periodYear
        ? { periodYear }
        : {}),
  };

  const rows = await prisma.financialObligation.findMany({
    where,
    include: {
      member: {
        select: {
          id: true,
          memberNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          email: true,
          status: true,
        },
      },
    },
    orderBy: [{ dueDate: 'asc' }],
    take: 5000,
  });

  // Group by member so the report reads as a list of people, not transactions.
  const byMember = new Map();
  for (const row of rows) {
    const existing = byMember.get(row.memberId) ?? {
      member: row.member,
      totalOutstanding: new Prisma.Decimal(0),
      overdueMonths: 0,
      oldestDueDate: row.dueDate,
      items: [],
    };
    existing.totalOutstanding = existing.totalOutstanding.add(money(row.balance));
    if (row.type === 'MONTHLY_DUES') existing.overdueMonths += 1;
    if (row.dueDate < existing.oldestDueDate) existing.oldestDueDate = row.dueDate;
    existing.items.push({
      id: row.id,
      title: row.title,
      type: row.type,
      balance: row.balance,
      dueDate: row.dueDate,
      status: row.status,
    });
    byMember.set(row.memberId, existing);
  }

  return [...byMember.values()]
    .map((entry) => ({
      memberId: entry.member.id,
      member: entry.member,
      totalOutstanding: entry.totalOutstanding,
      overdueMonths: entry.overdueMonths,
      oldestDueDate: entry.oldestDueDate,
      daysOverdue: Math.max(
        0,
        Math.floor((now.getTime() - new Date(entry.oldestDueDate).getTime()) / 86_400_000),
      ),
      items: entry.items,
    }))
    .sort((a, b) => Number(b.totalOutstanding) - Number(a.totalOutstanding))
    .slice(0, limit);
}

/** Aggregate delinquency figures for the Treasurer dashboard. */
export async function delinquencySummary(now = new Date()) {
  const grouped = await prisma.financialObligation.groupBy({
    by: ['status'],
    where: { status: { not: 'WAIVED' } },
    _sum: { balance: true, amountDue: true, amountPaid: true },
    _count: { _all: true },
  });

  const totals = grouped.reduce(
    (acc, row) => {
      acc.count += row._count._all;
      acc.balance = acc.balance.add(money(row._sum.balance ?? 0));
      acc.amountDue = acc.amountDue.add(money(row._sum.amountDue ?? 0));
      acc.amountPaid = acc.amountPaid.add(money(row._sum.amountPaid ?? 0));
      return acc;
    },
    {
      count: 0,
      balance: new Prisma.Decimal(0),
      amountDue: new Prisma.Decimal(0),
      amountPaid: new Prisma.Decimal(0),
    },
  );

  const overdue = await prisma.financialObligation.aggregate({
    where: { balance: { gt: 0 }, status: { notIn: ['PAID', 'WAIVED'] }, dueDate: { lt: now } },
    _sum: { balance: true },
    _count: { _all: true },
  });

  const delinquentRows = await prisma.financialObligation.findMany({
    where: { balance: { gt: 0 }, status: { notIn: ['PAID', 'WAIVED'] }, dueDate: { lt: now } },
    select: { memberId: true },
    distinct: ['memberId'],
  });

  return {
    totalOutstanding: totals.balance,
    totalBilled: totals.amountDue,
    totalCollected: totals.amountPaid,
    obligationCount: totals.count,
    overdueCount: overdue._count._all,
    overdueAmount: money(overdue._sum.balance ?? 0),
    delinquentMembers: new Set(delinquentRows.map((row) => row.memberId)).size,
    byStatus: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
  };
}

/**
 * Cash-flow summary for a period.
 *
 *   beginning balance + total income - total expenses = current cash balance
 *
 * Only POSTED transactions count; voided entries are excluded from both sides.
 */
export async function cashFlowSummary({ from, to } = {}) {
  const openingFunds = await prisma.fundAccount.findMany({
    where: { isActive: true },
    select: { openingBalance: true, openingDate: true },
  });

  const openingBalance = openingFunds.reduce(
    (acc, fund) => acc.add(money(fund.openingBalance)),
    new Prisma.Decimal(0),
  );

  const dateFilter = {};
  if (from || to) {
    dateFilter.transactionDate = {};
    if (from) dateFilter.transactionDate.gte = new Date(from);
    if (to) dateFilter.transactionDate.lte = new Date(to);
  }

  const grouped = await prisma.financialTransaction.groupBy({
    by: ['type'],
    where: { status: 'POSTED', ...dateFilter },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const income = money(
    grouped.find((row) => row.type === 'INCOME')?._sum.amount ?? 0,
  );
  const expenses = money(
    grouped.find((row) => row.type === 'EXPENSE')?._sum.amount ?? 0,
  );
  let beginning = openingBalance;
  if (from) {
    const previous = await prisma.financialTransaction.groupBy({ by: ['type'],
      where: { status: 'POSTED', transactionDate: { lt: new Date(from) } }, _sum: { amount: true } });
    for (const row of previous) beginning = row.type === 'INCOME'
      ? beginning.add(money(row._sum.amount ?? 0)) : beginning.minus(money(row._sum.amount ?? 0));
  }
  const net = income.minus(expenses);
  const current = beginning.add(net);

  return {
    beginningBalance: beginning,
    totalIncome: income,
    totalExpenses: expenses,
    netCashFlow: net,
    currentBalance: current,
    incomeCount: grouped.find((r) => r.type === 'INCOME')?._count._all ?? 0,
    expenseCount: grouped.find((r) => r.type === 'EXPENSE')?._count._all ?? 0,
  };
}

/** Monthly income vs expense series for the Treasurer dashboard chart. */
export async function monthlyCashFlowSeries({ months = 12 } = {}) {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - (months - 1));

  const transactions = await prisma.financialTransaction.findMany({
    where: { status: 'POSTED', transactionDate: { gte: start } },
    select: { transactionDate: true, type: true, amount: true },
    orderBy: { transactionDate: 'asc' },
  });

  const buckets = new Map();
  for (let i = 0; i < months; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
      income: 0,
      expenses: 0,
    });
  }

  for (const txn of transactions) {
    const key = `${txn.transactionDate.getFullYear()}-${txn.transactionDate.getMonth()}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (txn.type === 'INCOME') bucket.income += Number(txn.amount);
    else bucket.expenses += Number(txn.amount);
  }

  return [...buckets.values()];
}

/** Collections for a specific month (dues + fees actually received). */
export async function monthlyCollections({ periodYear, periodMonth }) {
  const from = new Date(periodYear, periodMonth - 1, 1);
  const to = new Date(periodYear, periodMonth, 0, 23, 59, 59);

  const [byType, totals] = await Promise.all([
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { paymentDate: { gte: from, lte: to }, transaction: { status: 'POSTED' } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { paymentDate: { gte: from, lte: to }, transaction: { status: 'POSTED' } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const duesCollected = await prisma.payment.aggregate({
    where: {
      paymentDate: { gte: from, lte: to },
      obligation: { type: 'MONTHLY_DUES' },
      transaction: { status: 'POSTED' },
    },
    _sum: { amount: true },
  });

  return {
    period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
    totalCollected: money(totals._sum.amount ?? 0),
    paymentCount: totals._count._all,
    duesCollected: money(duesCollected._sum.amount ?? 0),
    byMethod: Object.fromEntries(
      byType.map((row) => [row.paymentMethod, money(row._sum.amount ?? 0)]),
    ),
  };
}

/** Annual collections summary. */
export async function annualCollections({ year }) {
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31, 23, 59, 59);

  const grouped = await prisma.payment.groupBy({
    by: ['paymentDate'],
    where: { paymentDate: { gte: from, lte: to }, transaction: { status: 'POSTED' } },
    _sum: { amount: true },
  });

  const months = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    amount: new Prisma.Decimal(0),
  }));

  for (const row of grouped) {
    const index = new Date(row.paymentDate).getMonth();
    months[index].amount = months[index].amount.add(money(row._sum.amount ?? 0));
  }

  const total = months.reduce((acc, m) => acc.add(m.amount), new Prisma.Decimal(0));
  return { year, total, months };
}

/** Everything the member "My Dues & Payments" page needs, in one round trip. */
export async function memberFinancialSummary(memberId) {
  const obligations = await prisma.financialObligation.findMany({
    where: { memberId },
    orderBy: [{ dueDate: 'desc' }],
    include: {
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { status: true },
      },
    },
  });

  const [payments, submissions] = await Promise.all([
    prisma.payment.findMany({
      where: { memberId, transaction: { status: 'POSTED' } },
      orderBy: { paymentDate: 'desc' },
      include: { obligation: { select: { title: true, type: true } } },
      take: 50,
    }),
    prisma.paymentSubmission.findMany({
      where: { memberId },
      orderBy: { submittedAt: 'desc' },
      include: { attachments: { select: { id: true, url: true, fileName: true, mimeType: true } } },
      take: 50,
    }),
  ]);

  const totals = obligations.reduce(
    (acc, row) => {
      const pending = row.submissions.some((s) => s.status === 'PENDING_VERIFICATION');
      const balance = money(row.balance);
      acc.billed = acc.billed.add(money(row.amountDue));
      acc.paid = acc.paid.add(money(row.amountPaid));
      if (row.status !== 'WAIVED' && !balance.isZero()) {
        acc.outstanding = acc.outstanding.add(balance);
      }
      if (
        balance.greaterThan(0) &&
        row.status !== 'WAIVED' &&
        new Date(row.dueDate).getTime() < Date.now() &&
        !pending
      ) {
        acc.overdue = acc.overdue.add(balance);
        acc.overdueCount += 1;
      }
      return acc;
    },
    {
      billed: new Prisma.Decimal(0),
      paid: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(0),
      overdue: new Prisma.Decimal(0),
      overdueCount: 0,
    },
  );

  return {
    totals: {
      billed: totals.billed,
      paid: totals.paid,
      outstanding: totals.outstanding,
      overdue: totals.overdue,
      overdueCount: totals.overdueCount,
    },
    dues: obligations.filter((row) => row.type === 'MONTHLY_DUES'),
    communityService: obligations.filter((row) => row.type === 'COMMUNITY_SERVICE'),
    otherFees: obligations.filter((row) => row.type === 'OTHER_FEE'),
    payments,
    submissions,
  };
}
