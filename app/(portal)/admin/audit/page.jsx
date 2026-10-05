import { Filter, Shield } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { buildQueryString, formatDateTime } from '@/lib/utils';
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';

export const metadata = { title: 'Audit Logs' };
export const dynamic = 'force-dynamic';

const CATEGORY_TONES = {
  AUTH: 'bg-slate-100 text-slate-700 ring-slate-200',
  ADMIN: 'bg-rose-100 text-rose-800 ring-rose-200',
  MEMBER: 'bg-navy-100 text-navy-800 ring-navy-200',
  ATTENDANCE: 'bg-teal-100 text-teal-800 ring-teal-200',
  FINANCE: 'bg-amber-100 text-amber-900 ring-amber-200',
  CONTENT: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  OFFICER: 'bg-purple-100 text-purple-800 ring-purple-200',
  SYSTEM: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

const CATEGORY_OPTIONS = AUDIT_CATEGORIES.map((key) => ({
  value: key,
  label: AUDIT_CATEGORY_LABELS[key],
}));

export default async function AdminAuditPage({ searchParams }) {
  await requireRole('SYSTEM_ADMIN');
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, {
    defaultPageSize: 25,
  });

  // `status` carries the category filter on this page.
  const category = AUDIT_CATEGORIES.includes(status) ? status : null;

  const where = {
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { userEmail: { contains: q, mode: 'insensitive' } },
            { entity: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        category: true,
        action: true,
        entity: true,
        entityId: true,
        description: true,
        userEmail: true,
        userRole: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/admin/audit${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Append-only record of every security-sensitive action. Metadata is scrubbed of credentials before storage."
      />

      <DataPanel
        title="Audit entries"
        description={`${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'} match the current filter`}
        rows={entries}
        emptyIcon={Shield}
        emptyTitle="No audit entries"
        emptyDescription="Nothing matches the current search or category filter."
      >
        <FilterBar action="/admin/audit">
          <SearchInput defaultValue={q ?? ''} placeholder="Search action, user or entity…" />
          <SelectFilter
            name="status"
            value={category ?? ''}
            options={CATEGORY_OPTIONS}
            placeholder="All categories"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-800 px-3 text-xs font-medium text-white hover:bg-navy-900"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Filter
          </button>
        </FilterBar>

        <AuditTable rows={entries} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>

      <p className="text-[11px] text-ink-muted">
        Audit entries are never edited or deleted. Credential-shaped metadata keys
        (password, token, secret, …) are stripped before an entry is stored.
      </p>
    </div>
  );
}

function AuditTable({ rows }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('createdAt', 'Timestamp', {
          render: (r) => (
            <span className="whitespace-nowrap text-[11px] text-ink-soft">
              {formatDateTime(r.createdAt)}
            </span>
          ),
        }),
        col('category', 'Category', {
          render: (r) => (
            <Badge tone={CATEGORY_TONES[r.category] ?? CATEGORY_TONES.SYSTEM}>
              {AUDIT_CATEGORY_LABELS[r.category]}
            </Badge>
          ),
        }),
        col('action', 'Action', {
          render: (r) => (
            <>
              <p className="font-mono text-[11px] font-medium text-ink">{r.action}</p>
              {r.entity ? (
                <p className="mt-0.5 text-[10px] text-ink-muted">
                  {r.entity}
                  {r.entityId ? ` #${String(r.entityId).slice(0, 8)}` : ''}
                </p>
              ) : null}
            </>
          ),
        }),
        col('description', 'Detail', {
          render: (r) => (
            <span className="block max-w-md text-[11px] text-ink-soft">
              {r.description ?? '\u2014'}
            </span>
          ),
        }),
        col('user', 'User', {
          render: (r) => (
            <>
              <p className="text-[11px] text-ink">{r.userEmail ?? 'system'}</p>
              {r.userRole ? (
                <p className="mt-0.5 text-[10px] text-ink-muted">{r.userRole}</p>
              ) : null}
            </>
          ),
        }),
        col('ipAddress', 'IP', {
          render: (r) => (
            <span className="font-mono text-[10px] text-ink-muted">{r.ipAddress ?? '\u2014'}</span>
          ),
        }),
      ]}
    />
  );
}