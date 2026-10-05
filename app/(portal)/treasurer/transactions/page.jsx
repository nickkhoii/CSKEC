import { Filter } from 'lucide-react';
import { requirePermission, PERMISSIONS, can } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { cashFlowSummary } from '@/lib/finance';
import { formatPeso } from '@/lib/money';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import {
  TRANSACTION_STATUS_BADGE,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { DownloadLink } from '@/components/ui/download-link';
import { StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { VoidTransactionButton } from '@/components/finance/void-transaction';
import { CreateTransactionModal } from '@/components/finance/transaction-modal';

export const metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'POSTED', label: 'Posted' },
  { value: 'VOIDED', label: 'Voided' },
];

export default async function TransactionsPage({ searchParams }) {
  await requirePermission(PERMISSIONS.FINANCE_VIEW_REPORTS);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, {
    defaultPageSize: 25,
  });
  const canAddEntry = await can(PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS);
  const canVoid = await can(PERMISSIONS.FINANCE_VOID_TRANSACTION);

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { transactionNumber: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, transactions, cash, categories, members] = await Promise.all([
    prisma.financialTransaction.count({ where }),
    prisma.financialTransaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        transactionNumber: true,
        transactionDate: true,
        type: true,
        description: true,
        amount: true,
        reference: true,
        status: true,
        voidReason: true,
        category: { select: { name: true } },
        member: {
          select: { memberNumber: true, firstName: true, middleName: true, lastName: true },
        },
      },
    }),
    cashFlowSummary(),
    canAddEntry
      ? prisma.transactionCategory.findMany({
          where: { isActive: true },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canAddEntry
      ? prisma.member.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { lastName: 'asc' },
          take: 500,
          select: { id: true, memberNumber: true, firstName: true, middleName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);

  const buildHref = (nextPage) =>
    `/treasurer/transactions${buildQueryString({ ...params, page: nextPage })}`;

  const cards = [
    { label: 'Beginning Balance', value: formatPeso(cash.beginningBalance) },
    { label: 'Total Income', value: formatPeso(cash.totalIncome), tone: 'text-emerald-700' },
    { label: 'Total Expenses', value: formatPeso(cash.totalExpenses), tone: 'text-rose-700' },
    {
      label: 'Current Balance',
      value: formatPeso(cash.currentBalance),
      hint: 'Beginning + income − expenses',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every income and expense entry. Voided entries are retained but excluded from the cash position."
        actions={
          <>
            {canAddEntry ? (
              <CreateTransactionModal
                categories={categories}
                members={members.map((m) => ({
                  id: m.id,
                  name: fullName(m),
                  memberNumber: m.memberNumber,
                }))}
              />
            ) : null}
            <DownloadLink href="/api/reports/transactions" />
            <PrintButton />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-card"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${card.tone ?? 'text-ink'}`}>
              {card.value}
            </p>
            {card.hint ? <p className="mt-0.5 text-[11px] text-ink-muted">{card.hint}</p> : null}
          </div>
        ))}
      </div>

      <DataPanel
        title="Ledger"
        description={`${total} entr${total === 1 ? 'y' : 'ies'} match the current filter`}
        rows={transactions}
        emptyIcon={Filter}
        emptyTitle="No transactions"
        emptyDescription="Nothing matches the current search or status filter."
      >
        <FilterBar action="/treasurer/transactions">
          <SearchInput defaultValue={q ?? ''} placeholder="Search reference or description…" />
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

        <LedgerTable rows={transactions} canVoid={canVoid} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}

function LedgerTable({ rows, canVoid }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('transactionNumber', 'Reference', {
          render: (r) => (
            <>
              <p className="font-mono text-[11px] font-medium">{r.transactionNumber}</p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-muted">
                {formatDate(r.transactionDate)}
              </p>
            </>
          ),
        }),
        col('type', 'Type', {
          render: (r) => (
            <span
              className={`text-xs font-medium ${
                r.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {TRANSACTION_TYPE_LABELS[r.type]}
            </span>
          ),
        }),
        col('description', 'Description', {
          render: (r) => (
            <>
              <p className="text-xs">{r.description}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {r.category.name}
                {r.reference ? ` \u00b7 ${r.reference}` : ''}
              </p>
            </>
          ),
        }),
        col('member', 'Member', {
          render: (r) =>
            r.member ? (
              <span className="text-[11px] text-ink-soft">
                {r.member.memberNumber} {fullName(r.member)}
              </span>
            ) : (
              <span className="text-[11px] text-ink-muted">\u2014</span>
            ),
        }),
        col('amount', 'Amount', {
          align: 'right',
          render: (r) => (
            <span
              className={[
                'text-sm font-semibold tabular-nums',
                r.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700',
                r.status === 'VOIDED' ? 'line-through opacity-50' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {r.type === 'INCOME' ? '+' : '-'}
              {formatPeso(r.amount)}
            </span>
          ),
        }),
        col('status', 'Status', {
          render: (r) => (
            <>
              <StatusBadge
                value={r.status}
                labels={TRANSACTION_STATUS_LABELS}
                tones={TRANSACTION_STATUS_BADGE}
              />
              {r.voidReason ? (
                <p className="mt-1 max-w-[12rem] text-[10px] text-ink-muted">{r.voidReason}</p>
              ) : null}
            </>
          ),
        }),
        col('action', 'Action', {
          align: 'right',
          render: (r) =>
            r.status === 'VOIDED' ? null : (
              <VoidTransactionButton
                transactionId={r.id}
                disabled={!canVoid}
                disabledReason="You need finance:void_transaction"
              />
            ),
        }),
      ]}
    />
  );
}