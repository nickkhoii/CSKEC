import { Megaphone } from 'lucide-react';
import { requirePermission, PERMISSIONS, can } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams, textFilter } from '@/lib/queries';
import { buildQueryString, formatRelative, truncate } from '@/lib/utils';
import {
  POST_CATEGORIES,
  POST_CATEGORY_BADGE,
  POST_CATEGORY_LABELS,
  POST_CATEGORY_SHORT,
  PUBLICATION_STATUS_BADGE,
  PUBLICATION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import {
  CreatePostModal,
  EditPostModal,
  PostStatusControls,
} from '@/components/content/post-modals';

export const metadata = { title: 'Club Updates' };
export const dynamic = 'force-dynamic';

const CATEGORY_OPTIONS = POST_CATEGORIES.map((c) => ({ value: c, label: POST_CATEGORY_LABELS[c] }));
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export default async function SecretaryPostsPage({ searchParams }) {
  await requirePermission(PERMISSIONS.POST_MANAGE);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { defaultPageSize: 20 });
  const category = POST_CATEGORIES.includes(params?.category) ? params.category : null;

  const where = {
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(textFilter(q, ['title', 'excerpt', 'content']) ?? {}),
  };

  const [total, posts, activities, counts, canPublish] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        category: true,
        excerpt: true,
        status: true,
        isPinned: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.activity.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: { id: true, title: true },
    }),
    prisma.post.groupBy({ by: ['status'], _count: { _all: true } }),
    can(PERMISSIONS.POST_PUBLISH),
  ]);

  const countFor = (key) => counts.find((row) => row.status === key)?._count._all ?? 0;
  const buildHref = (nextPage) => `/secretary/posts${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Updates"
        description="Publish announcements, meeting recaps and community-service write-ups for every member."
        actions={<CreatePostModal activities={activities} />}
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
        title="All club updates"
        description={`${total} update(s) match the current filter`}
        rows={posts}
        emptyIcon={Megaphone}
        emptyTitle="No updates yet"
        emptyDescription="Create the first club update to get started."
      >
        <FilterBar action="/secretary/posts">
          <SearchInput defaultValue={q ?? ''} placeholder="Search title or content…" />
          <SelectFilter
            name="category"
            value={category ?? ''}
            options={CATEGORY_OPTIONS}
            placeholder="All categories"
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

        <UpdatesTable rows={posts} activities={activities} canPublish={canPublish} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}
function UpdatesTable({ rows, activities, canPublish }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('title', 'Update', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{truncate(r.title, 80)}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {r.excerpt ? truncate(r.excerpt, 90) : 'No excerpt'}
              </p>
            </>
          ),
        }),
        col('category', 'Category', {
          render: (r) => (
            <Badge tone={POST_CATEGORY_BADGE[r.category]}>{POST_CATEGORY_SHORT[r.category]}</Badge>
          ),
        }),
        col('isPinned', 'Pinned', {
          align: 'center',
          render: (r) =>
            r.isPinned ? <Badge tone="bg-gold-100 text-gold-800 ring-gold-200">Pinned</Badge> : '',
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
        col('updatedAt', 'Last change', {
          render: (r) => (
            <span className="whitespace-nowrap text-[11px] text-ink-muted">
              {formatRelative(r.publishedAt ?? r.updatedAt)}
            </span>
          ),
        }),
        col('actions', 'Actions', {
          align: 'right',
          render: (r) => (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <EditPostModal post={r} activities={activities} />
              <PostStatusControls post={r} canPublish={canPublish} />
            </div>
          ),
        }),
      ]}
    />
  );
}