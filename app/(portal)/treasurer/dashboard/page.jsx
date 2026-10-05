import {
  AlertTriangle,
  BarChart3,
  Banknote,
  ClipboardList,
  FileSpreadsheet,
  Receipt,
  Wallet,
} from 'lucide-react';
import { requireRole } from '@/lib/session';
import {
  cashFlowSummary,
  delinquencySummary,
  monthlyCashFlowSeries,
  monthlyCollections,
} from '@/lib/finance';
import { prisma } from '@/lib/prisma';
import { formatPeso, moneyToNumber } from '@/lib/money';
import { formatDate, formatRelative } from '@/lib/utils';
import {
  OBLIGATION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  SUBMISSION_STATUS_BADGE,
  SUBMISSION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { StatusBadge } from '@/components/ui';
import { CardGrid, DataPanel, LinkRow, SimpleTable, col } from '@/components/dashboard/panels';
import { IncomeExpenseChart } from '@/components/dashboard/income-expense-chart';

export const metadata = { title: 'Treasurer Dashboard' };
export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/treasurer/payments', label: 'Payment verification', icon: Receipt },
  { href: '/treasurer/dues', label: 'Monthly dues', icon: Wallet },
  { href: '/treasurer/obligations', label: 'Obligations', icon: ClipboardList },
  { href: '/treasurer/transactions', label: 'Transactions', icon: FileSpreadsheet },
  { href: '/treasurer/delinquent', label: 'Delinquent accounts', icon: AlertTriangle },
  { href: '/reports/cash-flow', label: 'Cash flow report', icon: BarChart3 },
];

export default async function TreasurerDashboardPage() {
  await requireRole('TREASURER');
  const now = new Date();

  const [cash, delinquency, series, collections, pendingSubmissions, recentTransactions] =
    await Promise.all([
      cashFlowSummary(),
      delinquencySummary(now),
      monthlyCashFlowSeries({ months: 12 }),
      monthlyCollections({ periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 }),
      prisma.paymentSubmission.findMany({
        where: { status: 'PENDING_VERIFICATION' },
        orderBy: { submittedAt: 'asc' },
        take: 8,
        select: {
          id: true,
          amount: true,
          submittedAt: true,
          type: true,
          paymentMethod: true,
          member: { select: { firstName: true, lastName: true, memberNumber: true } },
        },
      }),
      prisma.financialTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          transactionNumber: true,
          type: true,
          amount: true,
          description: true,
          transactionDate: true,
          status: true,
          member: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

  const netTone = cash.netCashFlow.gte(0) ? 'text-emerald-700' : 'text-rose-700';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treasurer Dashboard"
        description="Payment verification, collections, ledger position and delinquency."
      />

      <CardGrid
        cards={[
          {
            label: 'Current Balance',
            value: formatPeso(cash.currentBalance),
            hint: 'Opening + net cash flow',
            icon: Banknote,
            tone: 'navy',
          },
          {
            label: 'Collections (this month)',
            value: formatPeso(collections.totalCollected),
            hint: `${collections.paymentCount} payment(s) received`,
            icon: Wallet,
            tone: 'green',
          },
          {
            label: 'Outstanding Dues',
            value: formatPeso(delinquency.totalOutstanding),
            hint: `${delinquency.obligationCount} open obligation(s)`,
            icon: ClipboardList,
            tone: moneyToNumber(delinquency.totalOutstanding) > 0 ? 'amber' : 'green',
          },
          {
            label: 'Delinquent Members',
            value: delinquency.delinquentMembers,
            hint: `${delinquency.overdueCount} overdue obligation(s)`,
            icon: AlertTriangle,
            tone: delinquency.delinquentMembers > 0 ? 'red' : 'green',
          },
        ]}
      />

      <CashStrip cash={cash} pendingCount={pendingSubmissions.length} netTone={netTone} />

      <LinkRow links={QUICK_LINKS} />

      <IncomeExpenseChart data={series} />

      <PendingPaymentsPanel rows={pendingSubmissions} />
      <RecentLedgerPanel rows={recentTransactions} />
    </div>
  );
}

function CashStrip({ cash, pendingCount, netTone }) {
  const items = [
    { label: 'Pending Verifications', value: pendingCount, hint: 'Awaiting review' },
    {
      label: 'Total Income',
      value: formatPeso(cash.totalIncome),
      hint: `${cash.incomeCount} posted`,
    },
    {
      label: 'Total Expenses',
      value: formatPeso(cash.totalExpenses),
      hint: `${cash.expenseCount} posted`,
    },
    {
      label: 'Net Cash Flow',
      value: formatPeso(cash.netCashFlow),
      tone: netTone,
      hint: 'Income minus expenses',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-card"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {item.label}
          </p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${item.tone ?? 'text-ink'}`}>
            {item.value}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

function PendingPaymentsPanel({ rows }) {
  return (
    <DataPanel
      title="Payments awaiting verification"
      description="Approving posts the payment to the ledger and updates the member's balance."
      rows={rows}
      emptyIcon={Receipt}
      emptyTitle="Nothing to verify"
      emptyDescription="All submitted payments have been processed."
      action={
        <a
          href="/treasurer/payments?status=PENDING_VERIFICATION"
          className="text-xs font-medium text-navy-700 hover:underline"
        >
          Review all
        </a>
      }
    >
      <SimpleTable
        rows={rows}
        columns={[
          col('member', 'Member', {
            render: (r) => (
              <>
                <p className="font-medium text-ink">
                  {r.member.firstName} {r.member.lastName}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{r.member.memberNumber}</p>
              </>
            ),
          }),
          col('type', 'Type', {
            render: (r) => <span className="text-xs">{OBLIGATION_TYPE_LABELS[r.type]}</span>,
          }),
          col('amount', 'Amount', {
            align: 'right',
            render: (r) => <span className="text-xs font-semibold">{formatPeso(r.amount)}</span>,
          }),
          col('paymentMethod', 'Method', {
            render: (r) => <span className="text-xs">{PAYMENT_METHOD_LABELS[r.paymentMethod]}</span>,
          }),
          col('submittedAt', 'Submitted', {
            render: (r) => (
              <span className="whitespace-nowrap text-xs text-ink-muted">
                {formatRelative(r.submittedAt)}
              </span>
            ),
          }),
          col('status', 'Status', {
            render: () => (
              <StatusBadge
                value="PENDING_VERIFICATION"
                labels={SUBMISSION_STATUS_LABELS}
                tones={SUBMISSION_STATUS_BADGE}
              />
            ),
          }),
        ]}
      />
    </DataPanel>
  );
}

function RecentLedgerPanel({ rows }) {
  return (
    <DataPanel
      title="Recent ledger entries"
      action={
        <a href="/treasurer/transactions" className="text-xs font-medium text-navy-700 hover:underline">
          View all
        </a>
      }
      rows={rows}
      emptyIcon={FileSpreadsheet}
      emptyTitle="No transactions yet"
    >
      <SimpleTable
        rows={rows}
        columns={[
          col('transactionNumber', 'Reference', {
            render: (r) => <span className="text-xs font-medium">{r.transactionNumber}</span>,
          }),
          col('description', 'Description', {
            render: (r) => <span className="text-xs">{r.description}</span>,
          }),
          col('member', 'Member', {
            render: (r) => (
              <span className="text-xs text-ink-soft">
                {r.member ? `${r.member.firstName} ${r.member.lastName}` : '\u2014'}
              </span>
            ),
          }),
          col('transactionDate', 'Date', {
            render: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.transactionDate)}</span>,
          }),
          col('amount', 'Amount', {
            align: 'right',
            render: (r) => (
              <span
                className={[
                  'text-xs font-semibold',
                  r.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700',
                  r.status === 'VOIDED' ? 'line-through opacity-60' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {r.type === 'INCOME' ? '+' : '-'}
                {formatPeso(r.amount)}
              </span>
            ),
          }),
        ]}
      />
    </DataPanel>
  );
}