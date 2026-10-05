import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PERMISSIONS } from '@/lib/rbac';
import { can } from '@/lib/session';
import { audit } from '@/lib/audit';
import { csvResponseBody, reportFilename } from '@/lib/csv';
import { moneyToString } from '@/lib/money';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { fullName } from '@/lib/utils';
import {
  MEMBERSHIP_STATUS_LABELS,
  OBLIGATION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  POST_CATEGORY_LABELS,
  TRANSACTION_TYPE_LABELS,
} from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ---------------------------------------------------------------------------
 * CSV report export
 * ---------------------------------------------------------------------------
 * GET /api/reports/[report]?q=&status=&month=&year=
 *
 * Each report declares the permission it needs. An unauthorised request gets 403
 * and no data, even when the caller knows the exact URL - the server, not the
 * link the user was shown, is what decides.
 *
 * Exports are rate limited because they can read a whole table.
 */

const REPORTS = {
  'member-master': { permission: PERMISSIONS.REPORT_MEMBER_MASTER, build: memberMaster },
  attendance: { permission: PERMISSIONS.REPORT_ATTENDANCE, build: attendanceReport },
  transactions: { permission: PERMISSIONS.FINANCE_VIEW_REPORTS, build: transactionsReport },
  delinquent: { permission: PERMISSIONS.FINANCE_VIEW_REPORTS, build: delinquentReport },
  payments: { permission: PERMISSIONS.FINANCE_VIEW_REPORTS, build: paymentsReport },
  officers: { permission: PERMISSIONS.REPORT_OFFICERS, build: officersReport },
};

const jsonError = (message, status) =>
  NextResponse.json({ error: message }, { status });

export async function GET(request, { params }) {
  const user = await can(PERMISSIONS.DASHBOARD_VIEW);
  if (!user) return jsonError('Authentication required.', 401);

  const { report } = await params;
  const definition = REPORTS[report];
  if (!definition) return jsonError('Unknown report.', 404);

  if (!(await can(definition.permission))) {
    return jsonError('You do not have permission to export this report.', 403);
  }

  const limiter = checkRateLimit(`report:${user.id}:${report}`, { max: 20, windowSeconds: 60 });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Too many export requests. Please wait a moment and try again.' },
      { status: 429, headers: rateLimitHeaders(limiter) },
    );
  }

  const search = new URL(request.url).searchParams;
  const filters = {
    q: search.get('q')?.trim() || null,
    status: search.get('status') || null,
    month: search.get('month') ? Number(search.get('month')) : null,
    year: search.get('year') ? Number(search.get('year')) : null,
  };

  const { columns, rows } = await definition.build(filters);

  await audit({
    category: 'ADMIN',
    action: 'REPORT_EXPORTED',
    entity: 'Report',
    entityId: report,
    description: `${user.name} exported the "${report}" report as CSV.`,
    user: { id: user.id, email: user.email, role: user.role },
    metadata: { report, rowCount: rows.length },
  });

  return new NextResponse(csvResponseBody(columns, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${reportFilename(report)}"`,
      'Cache-Control': 'no-store',
      ...rateLimitHeaders(limiter),
    },
  });
}

async function memberMaster(filters) {
  const members = await prisma.member.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q
        ? {
            OR: [
              { memberNumber: { contains: filters.q, mode: 'insensitive' } },
              { firstName: { contains: filters.q, mode: 'insensitive' } },
              { lastName: { contains: filters.q, mode: 'insensitive' } },
              { email: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { memberNumber: 'asc' },
    include: { user: { select: { status: true, role: { select: { key: true } } } } },
  });

  return {
    columns: [
      { key: 'memberNumber', label: 'Member ID' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'contactNumber', label: 'Contact' },
      { key: 'status', label: 'Membership Status', map: (r) => MEMBERSHIP_STATUS_LABELS[r.status] },
      { key: 'dateJoined', label: 'Date Joined', map: (r) => r.dateJoined?.toISOString().slice(0, 10) },
      { key: 'accountStatus', label: 'Account Status' },
      { key: 'role', label: 'Portal Role' },
    ],
    rows: members.map((member) => ({
      memberNumber: member.memberNumber,
      name: fullName(member),
      email: member.email,
      contactNumber: member.contactNumber ?? '',
      status: member.status,
      dateJoined: member.dateJoined,
      accountStatus: member.user?.status ?? 'NO ACCOUNT',
      role: member.user?.role.key ?? '',
    })),
  };
}

async function attendanceReport(filters) {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q
        ? {
            OR: [
              { member: { memberNumber: { contains: filters.q, mode: 'insensitive' } } },
              { activity: { title: { contains: filters.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      member: { select: { memberNumber: true, firstName: true, middleName: true, lastName: true } },
      activity: { select: { title: true, startsAt: true, category: true } },
      approvedBy: { select: { fullName: true } },
    },
  });

  return {
    columns: [
      { key: 'memberNumber', label: 'Member ID' },
      { key: 'name', label: 'Member' },
      { key: 'activity', label: 'Activity' },
      { key: 'category', label: 'Category', map: (r) => POST_CATEGORY_LABELS[r.activity.category] },
      { key: 'date', label: 'Date', map: (r) => r.activity.startsAt?.toISOString().slice(0, 10) },
      { key: 'status', label: 'Result' },
      { key: 'hours', label: 'Hours', map: (r) => (r.hoursCredited ? Number(r.hoursCredited).toFixed(2) : '') },
      { key: 'source', label: 'Source' },
      { key: 'approvedBy', label: 'Approved By' },
    ],
    rows: records.map((record) => ({
      memberNumber: record.member.memberNumber,
      name: fullName(record.member),
      activity: record.activity.title,
      category: record.activity.category,
      date: record.activity.startsAt,
      status: record.status,
      hours: record.hoursCredited,
      source: record.source === 'MANUAL' ? 'Manual' : 'Request approved',
      approvedBy: record.approvedBy?.fullName ?? '',
    })),
  };
}

async function transactionsReport(filters) {
  const transactions = await prisma.financialTransaction.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.month && filters.year
        ? {
            transactionDate: {
              gte: new Date(filters.year, filters.month - 1, 1),
              lte: new Date(filters.year, filters.month, 0, 23, 59, 59),
            },
          }
        : {}),
    },
    orderBy: { transactionDate: 'desc' },
    take: 5000,
    include: {
      category: { select: { name: true } },
      member: { select: { memberNumber: true, firstName: true, middleName: true, lastName: true } },
    },
  });

  return {
    columns: [
      { key: 'transactionNumber', label: 'Transaction No.' },
      { key: 'date', label: 'Date', map: (r) => r.transactionDate?.toISOString().slice(0, 10) },
      { key: 'type', label: 'Type', map: (r) => TRANSACTION_TYPE_LABELS[r.type] },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount (PHP)' },
      { key: 'status', label: 'Status' },
      { key: 'member', label: 'Member' },
      { key: 'recordedBy', label: 'Recorded By' },
    ],
    rows: transactions.map((txn) => ({
      transactionNumber: txn.transactionNumber,
      date: txn.transactionDate,
      type: txn.type,
      category: txn.category.name,
      description: txn.description,
      amount: moneyToString(txn.amount),
      status: txn.status,
      member: txn.member ? `${txn.member.memberNumber} ${fullName(txn.member)}` : '',
      recordedBy: txn.recordedByName ?? '',
    })),
  };
}

async function delinquentReport(filters) {
  const rows = await prisma.financialObligation.findMany({
    where: {
      balance: { gt: 0 },
      status: { notIn: ['PAID', 'WAIVED'] },
      dueDate: { lt: new Date() },
      ...(filters.month && filters.year
        ? { periodMonth: filters.month, periodYear: filters.year }
        : {}),
    },
    orderBy: { dueDate: 'asc' },
    take: 5000,
    include: {
      member: {
        select: { memberNumber: true, firstName: true, middleName: true, lastName: true, email: true },
      },
    },
  });

  return {
    columns: [
      { key: 'memberNumber', label: 'Member ID' },
      { key: 'name', label: 'Member' },
      { key: 'email', label: 'Email' },
      { key: 'type', label: 'Obligation', map: (r) => OBLIGATION_TYPE_LABELS[r.type] },
      { key: 'title', label: 'Description' },
      { key: 'amountDue', label: 'Amount Due (PHP)' },
      { key: 'amountPaid', label: 'Paid (PHP)' },
      { key: 'balance', label: 'Outstanding (PHP)' },
      { key: 'dueDate', label: 'Due Date', map: (r) => r.dueDate?.toISOString().slice(0, 10) },
      { key: 'status', label: 'Status', map: (r) => PAYMENT_STATUS_LABELS[r.status] },
    ],
    rows: rows.map((row) => ({
      memberNumber: row.member.memberNumber,
      name: fullName(row.member),
      email: row.member.email,
      type: row.type,
      title: row.title,
      amountDue: moneyToString(row.amountDue),
      amountPaid: moneyToString(row.amountPaid),
      balance: moneyToString(row.balance),
      dueDate: row.dueDate,
      status: row.status,
    })),
  };
}

/** Officer register: every term ever recorded, current and historical. */
async function officersReport() {
  const assignments = await prisma.officerAssignment.findMany({
    orderBy: [{ status: 'asc' }, { termStart: 'desc' }],
    take: 5000,
    include: {
      member: { select: { memberNumber: true, firstName: true, middleName: true, lastName: true } },
      position: { select: { name: true, code: true } },
      appointedBy: { select: { fullName: true } },
    },
  });

  return {
    columns: [
      { key: 'memberNumber', label: 'Member ID' },
      { key: 'name', label: 'Member' },
      { key: 'position', label: 'Office' },
      { key: 'termStart', label: 'Term Start', map: (r) => r.termStart?.toISOString().slice(0, 10) },
      { key: 'termEnd', label: 'Term End', map: (r) => r.termEnd?.toISOString().slice(0, 10) ?? '' },
      { key: 'status', label: 'Status' },
      { key: 'appointedBy', label: 'Appointed By' },
    ],
    rows: assignments.map((row) => ({
      memberNumber: row.member.memberNumber,
      name: fullName(row.member),
      position: row.position.name,
      termStart: row.termStart,
      termEnd: row.termEnd,
      status: row.status,
      appointedBy: row.appointedBy?.fullName ?? '',
    })),
  };
}

/** Member payment ledger - one row per approved payment. */
async function paymentsReport(filters) {
  const payments = await prisma.payment.findMany({
    where:
      filters.month && filters.year
        ? {
            paymentDate: {
              gte: new Date(filters.year, filters.month - 1, 1),
              lte: new Date(filters.year, filters.month, 0, 23, 59, 59),
            },
          }
        : {},
    orderBy: { paymentDate: 'desc' },
    take: 5000,
    include: {
      member: { select: { memberNumber: true, firstName: true, middleName: true, lastName: true } },
      obligation: { select: { title: true } },
    },
  });

  return {
    columns: [
      { key: 'paymentNumber', label: 'Payment No.' },
      { key: 'memberNumber', label: 'Member ID' },
      { key: 'name', label: 'Member' },
      { key: 'obligation', label: 'Applied To' },
      { key: 'amount', label: 'Amount (PHP)' },
      { key: 'method', label: 'Method', map: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] },
      { key: 'reference', label: 'Reference' },
      { key: 'paymentDate', label: 'Date', map: (r) => r.paymentDate?.toISOString().slice(0, 10) },
      { key: 'approvedBy', label: 'Approved By' },
      { key: 'manual', label: 'Manual', map: (r) => (r.isManual ? 'Yes' : 'No') },
    ],
    rows: payments.map((payment) => ({
      paymentNumber: payment.paymentNumber,
      memberNumber: payment.member.memberNumber,
      name: fullName(payment.member),
      obligation: payment.obligation?.title ?? '',
      amount: moneyToString(payment.amount),
      method: payment.paymentMethod,
      reference: payment.referenceNumber,
      paymentDate: payment.paymentDate,
      approvedBy: payment.approvedByName ?? '',
      manual: payment.isManual,
    })),
  };
}