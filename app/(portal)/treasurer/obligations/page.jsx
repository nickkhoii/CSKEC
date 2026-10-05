import { ClipboardList } from 'lucide-react';
import { requirePermission, PERMISSIONS, can } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { formatPeso, moneyToNumber, paidPercentage } from '@/lib/money';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import {
  MONTH_NAMES,
  OBLIGATION_TYPES,
  OBLIGATION_TYPE_LABELS,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { ProgressBar, StatusBadge } from '@/components/ui';
import { DownloadLinkSmall } from '@/components/ui/download-link';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import {
  CreateObligationModal,
  GenerateCommunityServiceModal,
  WaiveObligationButton,
} from '@/components/finance/billing-modals';

export const metadata = { title: 'Obligations' };
export const dynamic = 'force-dynamic';

const TYPE_OPTIONS = OBLIGATION_TYPES.map((t) => ({ value: t, label: OBLIGATION_TYPE_LABELS[t] }));
const STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default async function TreasurerObligationsPage({ searchParams }) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { defaultPageSize: 25 });
  const type = OBLIGATION_TYPES.includes(params?.type) ? params.type : null;
  const canWaive = await can(PERMISSIONS.FINANCE_WAIVE_OBLIGATION);

  const where = {
    ...(type ? { type } : {}),
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

  const [total, rows, totals, members, activities] = await Promise.all([
    prisma.financialObligation.count({ where }),
    prisma.financialObligation.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        periodMonth: true,
        periodYear: true,
        amountDue: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        status: true,
        waiverReason: true,
        member: {
          select: { id: true, memberNumber: true, firstName: true, middleName: true, lastName: true },
        },
        activity: { select: { id: true, title: true } },
      },
    }),
    prisma.financialObligation.aggregate({
      where: type ? { type } : {},
      _sum: { amountDue: true, amountPaid: true, balance: true },
      _count: { _all: true },
    }),
    prisma.member.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
      take: 500,
      select: { id: true, memberNumber: true, firstName: true, middleName: true, lastName: true },
    }),
    prisma.activity.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: { id: true, title: true },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/treasurer/obligations${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Obligations"
        description="Community-service fees, assembly fees and other charges billed to members."
        actions={
          <>
            <CreateObligationModal
              members={members.map((m) => ({
                id: m.id,
                name: fullName(m),
                memberNumber: m.memberNumber,
              }))}
            />
            <GenerateCommunityServiceModal activities={activities} />
            <PrintButton />
          </>
        }
      />

      <CardGrid
        cards={[
          {
            label: 'Total Billed',
            value: formatPeso(totals._sum.amountDue ?? 0),
            hint: `${totals._count._all} obligation(s)`,
          },
          {
            label: 'Collected',
            value: formatPeso(totals._sum.amountPaid ?? 0),
            tone: 'text-emerald-700',
            hint: 'Approved payments only',
          },
          {
            label: 'Outstanding',
            value: formatPeso(totals._sum.balance ?? 0),
            tone: moneyToNumber(totals._sum.balance ?? 0) > 0 ? 'text-rose-700' : 'text-ink',
            hint: 'Sum of remaining balances',
          },
          {
            label: 'CS Activities',
            value: activities.length,
            hint: 'Published activities available to bill',
          },
        ]}
      />
      <ObligationsPanel
        rows={rows}
        total={total}
        q={q}
        type={type}
        status={status}
        page={page}
        pageSize={pageSize}
        buildHref={buildHref}
        canWaive={canWaive}
      />
    </div>
  );
}
function ObligationsPanel({ rows, total, q, type, status, page, pageSize, buildHref, canWaive }) {
  return (
    <DataPanel
      title="All obligations"
      description={`${total} obligation(s) match the current filter`}
      rows={rows}
      emptyIcon={ClipboardList}
      emptyTitle="No obligations"
      emptyDescription="Create an obligation or generate community-service charges."
      action={<DownloadLinkSmall href="/api/reports/delinquent" />}
    >
      <FilterBar action="/treasurer/obligations">
        <SearchInput defaultValue={q ?? ''} placeholder="Search member or title…" />
        <SelectFilter name="type" value={type ?? ''} options={TYPE_OPTIONS} placeholder="All types" />
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

      <ObligationsTable rows={rows} canWaive={canWaive} />
      <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
    </DataPanel>
  );
}

function ObligationsTable({ rows, canWaive }) {
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
        col('type', 'Obligation', {
          render: (r) => (
            <>
              <p className="text-xs font-medium text-ink">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {OBLIGATION_TYPE_LABELS[r.type]}
                {r.activity ? ` · ${r.activity.title}` : ''}
                {r.periodMonth && r.periodYear
                  ? ` · ${MONTH_NAMES[r.periodMonth - 1]} ${r.periodYear}`
                  : ''}
              </p>
            </>
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
              <ProgressBar value={paidPercentage(r.amountDue, r.amountPaid)} />
              <p className="mt-1 text-[10px] text-ink-muted">
                {paidPercentage(r.amountDue, r.amountPaid)}%
              </p>
            </div>
          ),
        }),
        col('status', 'Status', {
          render: (r) => (
            <>
              <StatusBadge
                value={r.status}
                labels={PAYMENT_STATUS_LABELS}
                tones={PAYMENT_STATUS_BADGE}
              />
              {r.waiverReason ? (
                <p className="mt-1 max-w-[12rem] text-[10px] text-ink-muted">{r.waiverReason}</p>
              ) : null}
            </>
          ),
        }),
        col('actions', '', {
          align: 'right',
          render: (r) =>
            canWaive && r.status !== 'PAID' && r.status !== 'WAIVED' ? (
              <WaiveObligationButton
                obligation={{ ...r, typeLabel: OBLIGATION_TYPE_LABELS[r.type] }}
              />
            ) : null,
        }),
      ]}
    />
  );
}
