import { Bell } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_PRIORITY_BADGE,
  NOTICE_PRIORITY_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';

export const metadata = { title: 'Notices' };
export const dynamic = 'force-dynamic';

/**
 * Official club notices.
 *
 * A notice is visible when it is published AND its audience matches the viewer's
 * role. `ALL_MEMBERS` and `ALL_OFFICERS` are matched by the caller; role-specific
 * audiences are checked here so a Treasurer-only notice never leaks to a member.
 */
export default async function NoticesPage() {
  const user = await requirePermission(PERMISSIONS.NOTICE_VIEW);

  // A notice is visible when it is published AND its audience matches the viewer.
  // `RoleKey` and `NoticeAudience` are different enums - a plain MEMBER is not a
  // valid NoticeAudience, so the role may only be matched when it really is one.
  // ALL_OFFICERS is restricted to officers so officer-only notices cannot leak.
  const OFFICER_ROLES = ['SECRETARY', 'TREASURER', 'PRESIDENT', 'SYSTEM_ADMIN'];
  const audiences = ['ALL_MEMBERS'];
  if (OFFICER_ROLES.includes(user.role)) audiences.push('ALL_OFFICERS');
  if (NOTICE_AUDIENCES.includes(user.role)) audiences.push(user.role);

  const notices = await prisma.notice.findMany({
    where: {
      status: 'PUBLISHED',
      audience: { in: audiences },
    },
    orderBy: [{ noticeDate: 'desc' }, { publishedAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      title: true,
      content: true,
      noticeDate: true,
      priority: true,
      audience: true,
      publishedAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices"
        description="Official announcements from the club Secretary, filtered to the notices addressed to you."
      />

      {notices.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={Bell}
              title="No notices"
              description="There are no published notices for you at the moment."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-4">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Card>
                <CardHeader
                  title={notice.title}
                  action={
                    <div className="flex items-center gap-2">
                      <Badge tone={NOTICE_PRIORITY_BADGE[notice.priority]}>
                        {NOTICE_PRIORITY_LABELS[notice.priority]}
                      </Badge>
                      <span className="text-[11px] text-ink-muted">
                        {formatDate(notice.noticeDate)}
                      </span>
                    </div>
                  }
                />
                <CardBody>
                  <p className="text-[11px] text-ink-muted">
                    For: {NOTICE_AUDIENCE_LABELS[notice.audience]}
                  </p>
                  <div className="prose-club mt-2 whitespace-pre-wrap">{notice.content}</div>
                  {notice.publishedAt ? (
                    <p className="mt-3 text-[11px] text-ink-muted">
                      Published {formatDateTime(notice.publishedAt)}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}