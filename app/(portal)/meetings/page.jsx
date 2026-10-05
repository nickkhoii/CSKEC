import { BookOpen, CalendarClock, MapPin } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  MEETING_STATUS_BADGE,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  MINUTE_STATUS_BADGE,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';

export const metadata = { title: 'Meetings & Minutes' };
export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  await requirePermission(PERMISSIONS.MEETING_VIEW);
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    prisma.meeting.findMany({
      where: { meetingDate: { gte: now } },
      orderBy: { meetingDate: 'asc' },
      take: 20,
      include: {
        presidingOfficer: { select: { firstName: true, lastName: true } },
        minutes: { select: { id: true, status: true } },
      },
    }),
    prisma.meeting.findMany({
      where: { meetingDate: { lt: now } },
      orderBy: { meetingDate: 'desc' },
      take: 50,
      include: {
        presidingOfficer: { select: { firstName: true, lastName: true } },
        minutes: { select: { id: true, status: true } },
      },
    }),
  ]);

  const columns = (basePath) => [
    col('title', 'Meeting', {
      render: (r) => (
        <>
          <p className="font-medium text-ink">{r.title}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {MEETING_TYPE_LABELS[r.meetingType]}
            {r.presidingOfficer
              ? ` \u00b7 ${r.presidingOfficer.firstName} ${r.presidingOfficer.lastName}`
              : ''}
          </p>
        </>
      ),
    }),
    col('meetingDate', 'Date', {
      render: (r) => (
        <span className="whitespace-nowrap text-xs">
          {formatDate(r.meetingDate)}
          <span className="mt-0.5 block text-[11px] text-ink-muted">{r.startTime}</span>
        </span>
      ),
    }),
    col('venue', 'Venue', {
      render: (r) => <span className="text-xs text-ink-soft">{r.venue ?? '\u2014'}</span>,
    }),
    col('status', 'Status', {
      render: (r) => (
        <StatusBadge
          value={r.status}
          labels={MEETING_STATUS_LABELS}
          tones={MEETING_STATUS_BADGE}
        />
      ),
    }),
    col('minutes', 'Minutes', {
      render: (r) => (
        r.minutes ? (
          <a href={`${basePath}/${r.id}`} className="text-[11px] font-medium text-navy-700 hover:underline">
            View minutes ({r.minutes.status.toLowerCase()})
          </a>
        ) : (
          <span className="text-[11px] text-ink-muted">Not published</span>
        )
      ),
    }),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings &amp; Minutes"
        description="Scheduled meetings and the official minutes recorded by the club Secretary."
        actions={<PrintButton />}
      />

      <DataPanel
        title="Upcoming meetings"
        rows={upcoming}
        emptyIcon={CalendarClock}
        emptyTitle="No upcoming meetings"
        emptyDescription="Nothing is currently scheduled."
      >
        <SimpleTable rows={upcoming} columns={columns('/meetings')} />
      </DataPanel>

      <DataPanel
        title="Past meetings &amp; minutes"
        description="Completed meetings with their approved or draft minutes."
        rows={past}
        emptyIcon={BookOpen}
        emptyTitle="No past meetings yet"
      >
        <SimpleTable rows={past} columns={columns('/meetings')} />
      </DataPanel>
    </div>
  );
}