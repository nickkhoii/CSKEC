import { TrendingUp } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import {
  annualCollections,
  cashFlowSummary,
  monthlyCashFlowSeries,
} from '@/lib/finance';
import { formatPeso } from '@/lib/money';
import { MONTH_NAMES, yearOptions } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { DownloadLink } from '@/components/ui/download-link';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { IncomeExpenseChart } from '@/components/dashboard/income-expense-chart';

export const metadata = { title: 'Cash Flow Report' };
export const dynamic = 'force-dynamic';

/**
 * Financial summary for the Treasurer and President.
 *
 * Every figure comes from the POSTED ledger only - voided entries are excluded
 * from cashFlowSummary/monthlyCashFlowSeries, so the printed position always
 * reconciles with the transaction register.
 */
export default async function CashFlowReportPage({ searchParams }) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS);
  const params = await searchParams;
  const year = Number.parseInt(params?.year, 10) || new Date().getFullYear();

  const [summary, series, annual] = await Promise.all([
    cashFlowSummary(),
    monthlyCashFlowSeries({ months: 12 }),
    annualCollections({ year }),
  ]);

  // monthlyCashFlowSeries returns raw income/expense buckets; net is derived
  // here so the table and the chart always agree with the ledger.
  const seriesRows = series.map((row) => ({
    ...row,
    net: Number(row.income ?? 0) - Number(row.expenses ?? 0),
  }));

  const cards = [
    { label: 'Beginning Balance', value: formatPeso(summary.beginningBalance), hint: 'Opening balance setting' },
    { label: 'Total Income', value: formatPeso(summary.totalIncome), tone: 'text-emerald-700', hint: 'Posted income entries' },
    { label: 'Total Expenses', value: formatPeso(summary.totalExpenses), tone: 'text-rose-700', hint: 'Posted expense entries' },
    {
      label: 'Current Balance',
      value: formatPeso(summary.currentBalance),
      hint: 'Beginning + income \u2212 expenses',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Report"
        description="Club funds position derived entirely from the posted ledger. Voided entries are excluded from every figure below."
        actions={
          <>
            <DownloadLink href="/api/reports/transactions" label="Ledger CSV" />
            <PrintButton />
          </>
        }
      />

      <CardGrid cards={cards} />

      <IncomeExpenseChart />

      <DataPanel
        title={`Monthly cash flow \u2014 last 12 months`}
        description="Posted transactions grouped by month."
        rows={seriesRows}
        emptyIcon={TrendingUp}
        emptyTitle="No cash movement recorded"
      >
        <SimpleTable
          rows={seriesRows}
          columns={[
            col('month', 'Month', { render: (r) => <span className="text-xs">{r.label}</span> }),
            col('income', 'Income', {
              align: 'right',
              render: (r) => (
                <span className="text-sm tabular-nums text-emerald-700">{formatPeso(r.income)}</span>
              ),
            }),
            col('expenses', 'Expenses', {
              align: 'right',
              render: (r) => (
                <span className="text-sm tabular-nums text-rose-700">{formatPeso(r.expenses)}</span>
              ),
            }),
            col('net', 'Net', {
              align: 'right',
              render: (r) => (
                <span className="text-sm font-semibold tabular-nums">
                  {formatPeso(r.net)}
                </span>
              ),
            }),
          ]}
        />
      </DataPanel>

      <DataPanel
        title={`Collections by month \u2014 ${year}`}
        description={`Total approved payments for ${year}: ${formatPeso(annual.total)}`}
        rows={annual.months}
        emptyIcon={TrendingUp}
        emptyTitle="No collections recorded"
      >
        <SimpleTable
          rows={annual.months}
          columns={[
            col('month', 'Month', {
              render: (r) => <span className="text-xs">{MONTH_NAMES[r.month - 1]}</span>,
            }),
            col('amount', 'Collected', {
              align: 'right',
              render: (r) => (
                <span className="text-sm font-semibold tabular-nums text-emerald-700">
                  {formatPeso(r.amount)}
                </span>
              ),
            }),
          ]}
        />
      </DataPanel>

      <p className="text-[11px] text-ink-muted">
        Available years:{' '}
        {yearOptions({ back: 3, forward: 1 })
          .map((y) => y.label)
          .join(', ')}
        . Add <code className="font-mono">?year=</code> to the URL to change the collections year.
      </p>
    </div>
  );
}
