import { AlertTriangle, CalendarCheck, TrendingUp, Users, Wallet } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { cashFlowSummary, delinquencySummary, monthlyCollections } from '@/lib/finance';
import { formatPeso, moneyToNumber } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import {
  ACTIVITY_TYPE_LABELS,
  MEMBERSHIP_STATUS_BADGE,
  MEMBERSHIP_STATUS_LABELS,
  MONTH_NAMES,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { StatusBadge } from '@/components/ui';
import { DownloadLink } from '@/components/ui/download-link';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { IncomeExpenseChart } from '@/components/dashboard/income-expense-chart';

export const metadata = { title: 'Club Overview' };
export const dynamic = 'force-dynamic';

/**
 * ---------------------------------------------------------------------------
 * President read-only club overview.
 *
 * Everything here is aggregated. The President deliberately holds no mutation
 * permission for finance or content, so this page exposes numbers only.
 * ---------------------------------------------------------------------------
 */
export default async function PresidentOverviewPage() {
  await requirePermission(PERMISSIONS.MEMBER_VIEW_ALL);
  const now = new Date();
  const year = now.getFullYear();

  const [memberCounts, cash, delinquency, collections, recentActivity, roles] = await Promise.all([
    prisma.member.groupBy({ by: ['status'], _count: { _all: true } }),
    cashFlowSummary(),
    delinquencySummary(now),
    monthlyCollections({ periodMonth: now.getMonth() + 1, periodYear: year }),
    prisma.activity.findMany({
      where: { startsAt: { gte: new Date(year, 0, 1) } },
      orderBy: { startsAt: 'desc' },
      take: 25,
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        creditsHours: true,
        _count: { select: { attendanceRecords: true } },
      },
    }),
    prisma.user.groupBy({ by: ['roleId'], where: { deletedAt: null }, _count: { _all: true } }),
  ]);

  const statusCount = (key) => memberCounts.find((row) => row.status === key)?._count._all ?? 0;
  const totalMembers = memberCounts.reduce((acc, row) => acc + row._count._all, 0);
  const totalAccounts = roles.reduce((acc, row) => acc + row._count._all, 0);
  const methods = Object.entries(collections.byMethod ?? {}).map(([method, amount]) => ({
    method,
    amount,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Overview"
        description="A read-only summary of membership, finances and attendance for the current club year."
        actions={
          <>
            <DownloadLink href="/api/reports/member-master" label="Member master (CSV)" />
            <PrintButton />
          </>
        }
      />

      <CardGrid
        cards={[
          {
            label: 'Total Members',
            value: totalMembers,
            hint: `${statusCount('ACTIVE')} active`,
            icon: Users,
            tone: 'navy',
          },
          {
            label: 'Portal Accounts',
            value: totalAccounts,
            hint: 'Users who can sign in',
            icon: Users,
            tone: 'slate',
          },
          {
            label: 'Club Funds',
            value: formatPeso(cash.currentBalance),
            hint: 'Beginning balance + net flow',
            icon: TrendingUp,
            tone: 'green',
          },
          {
            label: 'Outstanding',
            value: formatPeso(delinquency.totalOutstanding),
            hint: `${delinquency.delinquentMembers} delinquent member(s)`,
            icon: AlertTriangle,
            tone: moneyToNumber(delinquency.totalOutstanding) > 0 ? 'red' : 'green',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeExpenseChart />

        <DataPanel
          title={`Collections — ${MONTH_NAMES[now.getMonth()]} ${year}`}
          description={`Total ${formatPeso(collections.totalCollected)} · dues ${formatPeso(
            collections.duesCollected,
          )} from ${collections.paymentCount} payment(s)`}
          rows={methods}
          emptyIcon={Wallet}
          emptyTitle="No collections this month"
        >
          <SimpleTable
            rows={methods}
            rowKey="method"
            columns={[
              col('method', 'Payment method', {
                render: (r) => <span className="text-xs">{r.method.replace(/_/g, ' ')}</span>,
              }),
              col('amount', 'Collected', {
                align: 'right',
                render: (r) => (
                  <span className="text-sm font-semibold text-emerald-700">{formatPeso(r.amount)}</span>
                ),
              }),
            ]}
          />
        </DataPanel>
      </div>

      <MembershipBreakdown rows={memberCounts} total={totalMembers} />

      <DataPanel
        title="Activity attendance this year"
        description="Official attendance records created by the Secretary."
        rows={recentActivity}
        emptyIcon={CalendarCheck}
        emptyTitle="No activities recorded"
      >
        <SimpleTable
          rows={recentActivity}
          columns={[
            col('title', 'Activity', {
              render: (r) => (
                <>
                  <p className="font-medium text-ink">{r.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{ACTIVITY_TYPE_LABELS[r.type]}</p>
                </>
              ),
            }),
            col('startsAt', 'Date', {
              render: (r) => (
                <span className="whitespace-nowrap text-xs">{formatDate(r.startsAt)}</span>
              ),
            }),
            col('creditsHours', 'Credits', {
              align: 'right',
              render: (r) => (
                <span className="text-xs tabular-nums">
                  {r.creditsHours ? Number(r.creditsHours).toFixed(2) : '\u2014'}
                </span>
              ),
            }),
            col('attendance', 'Recorded', {
              align: 'right',
              render: (r) => <span className="text-sm tabular-nums">{r._count.attendanceRecords}</span>,
            }),
          ]}
        />
      </DataPanel>
    </div>
  );
}

function MembershipBreakdown({ rows, total }) {
  return (
    <DataPanel
      title="Membership breakdown"
      description="Membership status is separate from portal account status."
    >
      <SimpleTable
        rows={rows.map((row) => ({ status: row.status, count: row._count._all }))}
        rowKey="status"
        columns={[
          col('status', 'Membership status', {
            render: (r) => (
              <StatusBadge
                value={r.status}
                labels={MEMBERSHIP_STATUS_LABELS}
                tones={MEMBERSHIP_STATUS_BADGE}
              />
            ),
          }),
          col('count', 'Members', {
            align: 'right',
            render: (r) => <span className="text-sm tabular-nums">{r.count}</span>,
          }),
          col('share', 'Share', {
            align: 'right',
            render: (r) => (
              <span className="text-xs tabular-nums text-ink-muted">
                {total ? ((r.count / total) * 100).toFixed(1) : '0.0'}%
              </span>
            ),
          }),
        ]}
      />
    </DataPanel>
  );
}
