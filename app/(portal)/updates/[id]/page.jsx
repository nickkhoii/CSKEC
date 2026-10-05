import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, MapPin } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { roleCan } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { formatDate, formatDateTime } from '@/lib/utils';
import { POST_CATEGORY_BADGE, POST_CATEGORY_LABELS } from '@/lib/constants';
import { Badge, Card, CardBody } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Single club update.
 *
 * The page loads the post by id and then applies the SAME visibility rule as
 * the list: a non-published post is only visible to someone who can manage
 * posts, otherwise it 404s. Reading the row first and deciding afterwards
 * means an id that does not exist and a post you may not see are
 * indistinguishable from outside.
 */
export default async function UpdateDetailPage({ params }) {
  const user = await requirePermission(PERMISSIONS.POST_VIEW);
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      category: true,
      excerpt: true,
      content: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      venue: true,
      status: true,
      isPinned: true,
      publishedAt: true,
      createdBy: { select: { fullName: true } },
      attachments: {
        select: { id: true, url: true, fileName: true, mimeType: true, kind: true },
      },
    },
  });

  if (!post) notFound();

  const canSeeUnpublished = roleCan(user.role, PERMISSIONS.POST_MANAGE);
  if (post.status !== 'PUBLISHED' && !canSeeUnpublished) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/updates"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to club updates
      </Link>

      <Card>
        <CardBody className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={POST_CATEGORY_BADGE[post.category]}>
              {POST_CATEGORY_LABELS[post.category]}
            </Badge>
            {post.isPinned ? (
              <Badge tone="bg-gold-100 text-gold-800 ring-gold-200">Pinned</Badge>
            ) : null}
            {post.status !== 'PUBLISHED' ? (
              <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">{post.status}</Badge>
            ) : null}
            <span className="text-[11px] text-ink-muted">
              Published {formatDate(post.publishedAt)}
            </span>
          </div>

          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">{post.title}</h1>

          {(post.eventDate || post.venue) && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-soft">
              {post.eventDate ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-navy-500" aria-hidden="true" />
                  {formatDateTime(post.eventDate)}
                  {post.startTime ? ` – ${post.endTime ?? post.startTime}` : ''}
                </span>
              ) : null}
              {post.venue ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-navy-500" aria-hidden="true" />
                  {post.venue}
                </span>
              ) : null}
            </div>
          )}

          {post.excerpt ? (
            <p className="mt-4 border-l-2 border-navy-200 pl-3 text-sm italic text-ink-soft">
              {post.excerpt}
            </p>
          ) : null}

          <div className="prose-club mt-5 whitespace-pre-wrap">{post.content}</div>

          <p className="mt-6 border-t border-slate-100 pt-4 text-[11px] text-ink-muted">
            Posted by {post.createdBy.fullName}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}