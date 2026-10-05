import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { buildQueryString, formatDate, formatDateTime, truncate } from '@/lib/utils';
import {
  POST_CATEGORIES,
  POST_CATEGORY_BADGE,
  POST_CATEGORY_LABELS,
  POST_CATEGORY_SHORT,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';

export const metadata = { title: 'Club Updates' };
export const dynamic = 'force-dynamic';

const CATEGORY_OPTIONS = POST_CATEGORIES.map((c) => ({ value: c, label: POST_CATEGORY_LABELS[c] }));

export default async function UpdatesPage({ searchParams }) {
  await requirePermission(PERMISSIONS.POST_VIEW);
  const params = await searchParams;
  const { q, status: category, page, pageSize, skip, take } = readListParams(params, {
    defaultPageSize: 12,
  });

  const where = {
    // Members only ever see published content.
    status: 'PUBLISHED',
    ...(category && POST_CATEGORIES.includes(category) ? { category } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { excerpt: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        category: true,
        excerpt: true,
        eventDate: true,
        venue: true,
        isPinned: true,
        publishedAt: true,
      },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/updates${buildQueryString({ ...params, status: category, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Updates"
        description="Announcements, news, General Membership Meeting information, activities and community service news."
      />

      <DataPanel
        title="Published updates"
        description={`${total} update(s)`}
        rows={posts}
        emptyIcon={Megaphone}
        emptyTitle="No updates published"
        emptyDescription="When the Secretary publishes a club update it will appear here."
        bodyClassName="p-0"
      >
        <FilterBar action="/updates">
          <SearchInput defaultValue={q ?? ''} placeholder="Search updates…" />
          <SelectFilter
            name="status"
            value={category ?? ''}
            options={CATEGORY_OPTIONS}
            placeholder="All categories"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-navy-800 px-3 text-xs font-medium text-white hover:bg-navy-900"
          >
            Filter
          </button>
        </FilterBar>

        <ul className="divide-y divide-slate-100">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/updates/${post.id}`} className="block px-5 py-4 transition-colors hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={POST_CATEGORY_BADGE[post.category]}>
                    {POST_CATEGORY_SHORT[post.category]}
                  </Badge>
                  {post.isPinned ? (
                    <Badge tone="bg-gold-100 text-gold-800 ring-gold-200">Pinned</Badge>
                  ) : null}
                  <span className="text-[11px] text-ink-muted">
                    {formatDate(post.publishedAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-ink">{post.title}</p>
                {post.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{post.excerpt}</p>
                ) : null}
                <p className="mt-1 text-[11px] text-ink-muted">
                  {post.eventDate ? formatDateTime(post.eventDate) : null}
                  {post.venue ? ` \u00b7 ${post.venue}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}