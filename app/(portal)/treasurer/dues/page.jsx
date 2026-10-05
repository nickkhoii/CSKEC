import { Wallet } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { SETTING_KEYS, getNumberSetting, getSetting } from '@/lib/settings';
import { formatPeso, moneyToNumber, paidPercentage } from '@/lib/money';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import { MONTH_NAMES, PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { DownloadLinkSmall } from '@/components/ui/download-link';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { GenerateDuesModal } from '@/components/finance/billing-modals';

export const metadata = { title: 'Monthly Dues' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default async function TreasurerDuesPage({ searchParams }) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { defaultPageSize: 25 });

  const [defaultAmount, dueDay] = await Promise.all([
    getSetting(SETTING_KEYS.DEFAULT_DUES_AMOUNT),
    getNumberSetting(await getSetting(SETTING_KEYS.DUES_DUE_DAY), 10),
  ]);

  const where = {
    type: 'MONTHLY_DUES',
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { member: { memberNumber: { contains: q, mode: 'insensitive' } } },
            { member: { firstName: { contains: q, mode: 'insensitive' } } },
            { member: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, rows, totals, activeMembers] = await Promise.all([
    prisma.financialObligation.count({ where }),
    prisma.financialObligation.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        periodMonth: true,
        periodYear: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        status: true,
        member: {
          select: { id: true, memberNumber: true, firstName: true, middleName: true, lastName: true },
        },
      },
    }),
    prisma.financialObligation.aggregate({
      where: { type: 'MONTHLY_DUES' },
      _sum: { amountDue: true, amountPaid: true, balance: true },
      _count: { _all: true },
    }),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
  ]);

  const billed = totals._sum.amountDue;
  const paid = totals._sum.amountPaid;
  const outstanding = totals._sum.balance;

  const buildHref = (nextPage) => `/treasurer/dues${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Dues"
        description="Billing periods and member dues balances. Generating a period twice is a no-op — each obligation carries a deterministic dedupe key."
        actions={
          <>
            <GenerateDuesModal defaultAmount={defaultAmount} defaultDueDay={dueDay} />
            <PrintButton />
          </>
        }
      />

      <CardGrid
        cards={[
          {
            label: 'Total Billed',
            value: formatPeso(billed ?? 0),
            hint: `${totals._count._all} dues obligation(s)`,
          },
          {
            label: 'Total Collected',
            value: formatPeso(paid ?? 0),
            hint: 'Approved payments only',
            tone: 'text-emerald-700',
          },
          {
            label: 'Outstanding',
            value: formatPeso(outstanding ?? 0),
            hint: 'Still owed by members',
            tone: moneyToNumber(outstanding ?? 0) > 0 ? 'text-rose-700' : 'text-ink',
          },
          {
            label: 'Active Members',
            value: activeMembers,
            hint: `Billed on generation \u00b7 due day ${dueDay}`,
          },
        ]}
      />

      <DataPanel
        title="Dues obligations"
        description={`${total} obligation(s) match the current filter`}
        rows={rows}
        emptyIcon={Wallet}
        emptyTitle="No dues obligations"
        emptyDescription="Generate the first monthly dues period to start billing members."
        action={<DownloadLinkSmall href="/api/reports/delinquent" />}
      >
        <FilterBar action="/treasurer/dues">
          <SearchInput defaultValue={q ?? ''} placeholder="Search member or title…" />
          <SelectFilter
            name="status"
            value={status ?? ''}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-800 px-3 text-xs font-medium text-white hover:bg-navy-900"
          >
            Filter
          </button>
        </FilterBar>

        <DuesTable rows={rows} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}
function DuesTable({ rows }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('member', 'Member', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{fullName(r.member)}</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-muted">{r.member.memberNumber}</p>
            </>
          ),
        }),
        col('period', 'Period', {
          render: (r) =>
            r.periodMonth && r.periodYear ? (
              <span className="text-xs">
                {MONTH_NAMES[r.periodMonth - 1]} {r.periodYear}
              </span>
            ) : (
              <span className="text-xs text-ink-muted">\u2014</span>
            ),
        }),
        col('dueDate', 'Due', {
          render: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.dueDate)}</span>,
        }),
        col('amountDue', 'Amount', {
          align: 'right',
          render: (r) => <span className="text-sm tabular-nums">{formatPeso(r.amountDue)}</span>,
        }),
        col('balance', 'Balance', {
          align: 'right',
          render: (r) => (
            <span
              className={`text-sm font-semibold tabular-nums ${
                Number(r.balance) > 0 && r.status !== 'WAIVED' ? 'text-rose-700' : 'text-ink'
              }`}
            >
              {formatPeso(r.balance)}
            </span>
          ),
        }),
        col('progress', 'Paid', {
          render: (r) => (
            <div className="min-w-[7rem]">
              <ProgressBar
                value={paidPercentage(r.amountDue, r.amountPaid)}
                tone={
                  r.status === 'PAID'
                    ? 'bg-emerald-600'
                    : r.status === 'OVERDUE'
                      ? 'bg-rose-600'
                      : 'bg-navy-600'
                }
              />
              <p className="mt-1 text-[10px] text-ink-muted">
                {paidPercentage(r.amountDue, r.amountPaid)}%
              </p>
            </div>
          ),
        }),
        col('status', 'Status', {
          render: (r) => (
            <StatusBadge value={r.status} labels={PAYMENT_STATUS_LABELS} tones={PAYMENT_STATUS_BADGE} />
          ),
        }),
      ]}
    />
  );
}
