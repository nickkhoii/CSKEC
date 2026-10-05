import {
  Bell,
  CalendarCheck,
  CalendarClock,
  FileText,
  Megaphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatRelative, truncate } from '@/lib/utils';
import {
  ATTENDANCE_REQUEST_STATUS_BADGE,
  ATTENDANCE_REQUEST_STATUS_LABELS,
  NOTICE_PRIORITY_BADGE,
  NOTICE_PRIORITY_LABELS,
  POST_CATEGORY_BADGE,
  POST_CATEGORY_SHORT,
  PUBLICATION_STATUS_BADGE,
  PUBLICATION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader, EmptyState, StatusBadge, Badge } from '@/components/ui';
import { CardGrid, DataPanel, LinkRow, SimpleTable, col } from '@/components/dashboard/panels';

export const metadata = { title: 'Secretary Dashboard' };
export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/secretary/members', label: 'Members', icon: Users },
  { href: '/secretary/posts', label: 'Club updates', icon: Megaphone },
  { href: '/secretary/attendance', label: 'Attendance review', icon: CalendarCheck },
  { href: '/secretary/notices', label: 'Notices', icon: Bell },
  { href: '/secretary/meetings', label: 'Meeting minutes', icon: FileText },
  { href: '/secretary/officers', label: 'Officers', icon: ShieldCheck },
];

export default async function SecretaryDashboardPage() {
  await requireRole('SECRETARY');
  const now = new Date();

  const [
    activeMembers,
    newThisMonth,
    pendingAttendance,
    upcomingMeetings,
    recentUpdates,
    urgentNotices,
    pendingRequests,
  ] = await Promise.all([
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.member.count({
      where: { dateJoined: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
    }),
    prisma.attendanceRequest.count({ where: { status: 'PENDING' } }),
    prisma.meeting.findMany({
      where: { status: 'SCHEDULED', meetingDate: { gte: now } },
      orderBy: { meetingDate: 'asc' },
      take: 5,
      select: { id: true, title: true, meetingDate: true, startTime: true, venue: true },
    }),
    prisma.post.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
    }),
    prisma.notice.findMany({
      where: { status: 'PUBLISHED', priority: { in: ['IMPORTANT', 'URGENT'] } },
      orderBy: { noticeDate: 'desc' },
      take: 4,
      select: { id: true, title: true, priority: true, noticeDate: true },
    }),
    prisma.attendanceRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { submittedAt: 'asc' },
      take: 8,
      select: {
        id: true,
        submittedAt: true,
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        activity: { select: { title: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Secretary Dashboard"
        description="Membership records, attendance verification and club communications."
      />

      <CardGrid
        cards={[
          {
            label: 'Active Members',
            value: activeMembers,
            hint: `${newThisMonth} joined this month`,
            icon: Users,
            tone: 'navy',
          },
          {
            label: 'Pending Attendance',
            value: pendingAttendance,
            hint: pendingAttendance > 0 ? 'Awaiting your review' : 'Nothing to review',
            icon: CalendarCheck,
            tone: pendingAttendance > 0 ? 'amber' : 'green',
          },
          {
            label: 'Upcoming Meetings',
            value: upcomingMeetings.length,
            hint: upcomingMeetings[0] ? formatDate(upcomingMeetings[0].meetingDate) : 'None scheduled',
            icon: CalendarClock,
            tone: 'gold',
          },
          {
            label: 'Recent Updates',
            value: recentUpdates.length,
            hint: 'Latest posts and drafts',
            icon: FileText,
            tone: 'slate',
          },
        ]}
      />

      <LinkRow links={QUICK_LINKS} />

      <PendingAttendancePanel rows={pendingRequests} />
      <UpcomingMeetingsPanel rows={upcomingMeetings} />
      <RecentUpdatesPanel rows={recentUpdates} />
      <UrgentNoticesPanel rows={urgentNotices} />
    </div>
  );
}

function PendingAttendancePanel({ rows }) {
  return (
    <DataPanel
      title="Attendance requests awaiting review"
      description="Oldest first. Approving creates the official attendance record."
      rows={rows}
      emptyIcon={CalendarCheck}
      emptyTitle="Nothing to review"
      emptyDescription="All attendance requests have been processed."
      action={
        <a href="/secretary/attendance?status=PENDING" className="text-xs font-medium text-navy-700 hover:underline">
          Review all
        </a>
      }
    >
      <SimpleTable
        rows={rows}
        columns={[
          col('member', 'Member', {
            render: (r) => (
              <>
                <p className="font-medium text-ink">
                  {r.member.firstName} {r.member.lastName}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{r.member.memberNumber}</p>
              </>
            ),
          }),
          col('activity', 'Activity', {
            render: (r) => <span className="text-xs">{r.activity.title}</span>,
          }),
          col('submittedAt', 'Submitted', {
            render: (r) => (
              <span className="whitespace-nowrap text-xs text-ink-muted">
                {formatRelative(r.submittedAt)}
              </span>
            ),
          }),
          col('status', 'Status', {
            render: () => (
              <StatusBadge
                value="PENDING"
                labels={ATTENDANCE_REQUEST_STATUS_LABELS}
                tones={ATTENDANCE_REQUEST_STATUS_BADGE}
              />
            ),
          }),
        ]}
      />
    </DataPanel>
  );
}

function UpcomingMeetingsPanel({ rows }) {
  return (
    <Card>
      <CardHeader title="Upcoming meetings" />
      <CardBody className="p-2">
        {rows.length === 0 ? (
          <EmptyState title="No meetings scheduled" />
        ) : (
          rows.map((meeting) => (
            <a
              key={meeting.id}
              href="/secretary/meetings"
              className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{meeting.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {formatDate(meeting.meetingDate)} &middot; {meeting.startTime}
                  {meeting.venue ? ` \u00b7 ${meeting.venue}` : ''}
                </p>
              </div>
            </a>
          ))
        )}
      </CardBody>
    </Card>
  );
}

function RecentUpdatesPanel({ rows }) {
  return (
    <Card>
      <CardHeader
        title="Recent club updates"
        action={
          <a href="/secretary/posts" className="text-xs font-medium text-navy-700 hover:underline">
            Manage
          </a>
        }
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No updates yet" description="Create your first club update." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((post) => (
              <li key={post.id}>
                <a href={`/updates/${post.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={POST_CATEGORY_BADGE[post.category]}>
                      {POST_CATEGORY_SHORT[post.category]}
                    </Badge>
                    <StatusBadge
                      value={post.status}
                      labels={PUBLICATION_STATUS_LABELS}
                      tones={PUBLICATION_STATUS_BADGE}
                    />
                    <span className="text-[11px] text-ink-muted">
                      {formatRelative(post.publishedAt ?? post.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{truncate(post.title, 70)}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function UrgentNoticesPanel({ rows }) {
  return (
    <Card>
      <CardHeader
        title="Important &amp; urgent notices"
        action={
          <a href="/secretary/notices" className="text-xs font-medium text-navy-700 hover:underline">
            Manage
          </a>
        }
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No urgent notices" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((notice) => (
              <li key={notice.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{notice.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{formatDate(notice.noticeDate)}</p>
                </div>
                <Badge tone={NOTICE_PRIORITY_BADGE[notice.priority]}>
                  {NOTICE_PRIORITY_LABELS[notice.priority]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}