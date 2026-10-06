import { Bell } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams, textFilter } from '@/lib/queries';
import { buildQueryString, formatDate } from '@/lib/utils';
import {
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_PRIORITIES,
  NOTICE_PRIORITY_BADGE,
  NOTICE_PRIORITY_LABELS,
  PUBLICATION_STATUS_BADGE,
  PUBLICATION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { CreateNoticeModal, NoticeRowControls } from '@/components/content/notice-modals';

export const metadata = { title: 'Notices' };
export const dynamic = 'force-dynamic';

const PRIORITY_OPTIONS = NOTICE_PRIORITIES.map((p) => ({ value: p, label: NOTICE_PRIORITY_LABELS[p] }));
const AUDIENCE_OPTIONS = NOTICE_AUDIENCES.map((a) => ({ value: a, label: NOTICE_AUDIENCE_LABELS[a] }));
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export default async function SecretaryNoticesPage({ searchParams }) {
  await requirePermission(PERMISSIONS.NOTICE_MANAGE);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value), defaultPageSize: 20 });
  const priority = NOTICE_PRIORITIES.includes(params?.priority) ? params.priority : null;
  const audience = NOTICE_AUDIENCES.includes(params?.audience) ? params.audience : null;

  const where = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(audience ? { audience } : {}),
    ...(textFilter(q, ['title', 'content']) ?? {}),
  };

  const [total, notices, counts] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ noticeDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        content: true,
        noticeDate: true,
        expiryDate: true,
        priority: true,
        audience: true,
        status: true,
      },
    }),
    prisma.notice.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (key) => counts.find((row) => row.status === key)?._count._all ?? 0;
  const buildHref = (nextPage) => `/secretary/notices${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices"
        description="Official club announcements. Each notice is addressed to a specific audience."
        actions={<CreateNoticeModal />}
      />

      <CardGrid
        cards={[
          { label: 'Total', value: counts.reduce((acc, r) => acc + r._count._all, 0) },
          { label: 'Published', value: countFor('PUBLISHED'), tone: 'text-emerald-700' },
          { label: 'Drafts', value: countFor('DRAFT'), tone: 'text-amber-700' },
          { label: 'Archived', value: countFor('ARCHIVED'), tone: 'text-ink-muted' },
        ]}
      />

      <DataPanel
        title="All notices"
        description={`${total} notice(s) match the current filter`}
        rows={notices}
        emptyIcon={Bell}
        emptyTitle="No notices yet"
        emptyDescription="Publish the first official notice for the club."
      >
        <FilterBar action="/secretary/notices">
          <SearchInput defaultValue={q ?? ''} placeholder="Search title or content…" />
          <SelectFilter
            name="priority"
            value={priority ?? ''}
            options={PRIORITY_OPTIONS}
            placeholder="All priorities"
          />
          <SelectFilter
            name="audience"
            value={audience ?? ''}
            options={AUDIENCE_OPTIONS}
            placeholder="All audiences"
          />
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

        <NoticeTable rows={notices} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}

function NoticeTable({ rows }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('title', 'Notice', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {r.content.slice(0, 90)}
                {r.content.length > 90 ? '…' : ''}
              </p>
            </>
          ),
        }),
        col('priority', 'Priority', {
          render: (r) => (
            <Badge tone={NOTICE_PRIORITY_BADGE[r.priority]}>
              {NOTICE_PRIORITY_LABELS[r.priority]}
            </Badge>
          ),
        }),
        col('audience', 'Audience', {
          render: (r) => <span className="text-xs">{NOTICE_AUDIENCE_LABELS[r.audience]}</span>,
        }),
        col('noticeDate', 'Date', {
          render: (r) => (
            <span className="whitespace-nowrap text-xs">
              {formatDate(r.noticeDate)}
              {r.expiryDate ? (
                <span className="mt-0.5 block text-[11px] text-ink-muted">
                  Expires {formatDate(r.expiryDate)}
                </span>
              ) : null}
            </span>
          ),
        }),
        col('status', 'Status', {
          render: (r) => (
            <StatusBadge
              value={r.status}
              labels={PUBLICATION_STATUS_LABELS}
              tones={PUBLICATION_STATUS_BADGE}
            />
          ),
        }),
        col('actions', 'Actions', {
          align: 'right',
          render: (r) => <NoticeRowControls notice={r} />,
        }),
      ]}
    />
  );
}