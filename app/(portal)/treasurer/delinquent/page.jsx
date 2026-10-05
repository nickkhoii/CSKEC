import { AlertTriangle } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { delinquencySummary, delinquentMembers } from '@/lib/finance';
import { formatPeso, moneyToNumber } from '@/lib/money';
import { formatDate, fullName } from '@/lib/utils';
import { OBLIGATION_TYPE_LABELS } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { DownloadLink } from '@/components/ui/download-link';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';

export const metadata = { title: 'Delinquent Accounts' };
export const dynamic = 'force-dynamic';

export default async function DelinquentPage({ searchParams }) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS);
  const params = await searchParams;
  const month = params?.month ? Number(params.month) : null;
  const year = params?.year ? Number(params.year) : null;

  const [summary, members] = await Promise.all([
    delinquencySummary(),
    delinquentMembers({ periodMonth: month, periodYear: year, limit: 500 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delinquent Accounts"
        description="Members with outstanding, past-due obligations, grouped per member with the number of overdue months."
        actions={
          <>
            <DownloadLink href="/api/reports/delinquent" />
            <PrintButton />
          </>
        }
      />

      <CardGrid
        cards={[
          {
            label: 'Total Outstanding',
            value: formatPeso(summary.totalOutstanding),
            hint: 'Across all open obligations',
            tone: moneyToNumber(summary.totalOutstanding) > 0 ? 'amber' : 'green',
          },
          {
            label: 'Overdue Amount',
            value: formatPeso(summary.overdueAmount),
            hint: `${summary.overdueCount} overdue obligation(s)`,
            tone: moneyToNumber(summary.overdueAmount) > 0 ? 'red' : 'green',
          },
          {
            label: 'Delinquent Members',
            value: summary.delinquentMembers,
            hint: 'With at least one overdue balance',
            tone: summary.delinquentMembers > 0 ? 'red' : 'green',
          },
          {
            label: 'Total Collected',
            value: formatPeso(summary.totalCollected),
            hint: `of ${formatPeso(summary.totalBilled)} billed`,
            tone: 'green',
          },
        ]}
      />

      <DataPanel
        title="Members with outstanding balances"
        description={`${members.length} member(s) currently delinquent`}
        rows={members}
        emptyIcon={AlertTriangle}
        emptyTitle="No delinquent accounts"
        emptyDescription="Every obligation is paid, waived or not yet due."
      >
        <SimpleTable
          rows={members}
          rowKey="memberId"
          columns={[
            col('member', 'Member', {
              render: (r) => (
                <>
                  <p className="font-medium text-ink">{fullName(r.member)}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                    {r.member.memberNumber}
                  </p>
                </>
              ),
            }),
            col('totalOutstanding', 'Total Outstanding', {
              align: 'right',
              render: (r) => (
                <span className="text-sm font-semibold text-rose-700">
                  {formatPeso(r.totalOutstanding)}
                </span>
              ),
            }),
            col('overdueMonths', 'Overdue Months', {
              align: 'right',
              render: (r) => <span className="text-sm tabular-nums">{r.overdueMonths}</span>,
            }),
            col('oldestDueDate', 'Oldest Due', {
              render: (r) => (
                <span className="whitespace-nowrap text-xs">{formatDate(r.oldestDueDate)}</span>
              ),
            }),
            col('daysOverdue', 'Days Overdue', {
              align: 'right',
              render: (r) => (
                <span className="text-xs tabular-nums text-rose-700">{r.daysOverdue}</span>
              ),
            }),
            col('items', 'Breakdown', { render: (r) => <Breakdown items={r.items} /> }),
          ]}
        />
      </DataPanel>
    </div>
  );
}

/** Expandable per-obligation breakdown behind each delinquent member. */
function Breakdown({ items }) {
  return (
    <details className="max-w-md">
      <summary className="cursor-pointer text-[11px] font-medium text-navy-700">
        {items.length} obligation(s)
      </summary>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-ink-muted">
              {OBLIGATION_TYPE_LABELS[item.type]} &middot; {item.title}
            </span>
            <span className="shrink-0 tabular-nums text-rose-700">{formatPeso(item.balance)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}