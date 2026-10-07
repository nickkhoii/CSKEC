import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { meetingAttendance } from '@/lib/meeting-attendance';
import { MeetingAttendance } from '@/components/content/meeting-attendance';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  MEETING_STATUS_BADGE,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  MINUTE_STATUS_BADGE,
  MINUTE_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from '@/components/ui';
import { SimpleTable, col } from '@/components/dashboard/panels';

export const dynamic = 'force-dynamic';

/**
 * Printable meeting minutes.
 *
 * Draft minutes are visible only to someone who can manage minutes; everyone
 * else gets a 404, so an unapproved record never leaks.
 */
export default async function MeetingDetailPage({ params }) {
  const user = await requirePermission(PERMISSIONS.MEETING_VIEW);
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      presidingOfficer: { select: { firstName: true, lastName: true } },
      createdBy: { select: { fullName: true } },
      attendees: { orderBy: { name: 'asc' } },
      minutes: { include: { attachments: { select: { id: true, url: true, fileName: true } } } },
    },
  });

  if (!meeting) notFound();

  const canManage = user.permissions?.includes(PERMISSIONS.MINUTE_MANAGE);
  if (meeting.minutes?.status === 'DRAFT' && !canManage) notFound();

  const minutes = meeting.minutes;
  const attendance = await meetingAttendance(id);

  return (
    <div className="space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to meetings
      </Link>

      <PageHeader
        title={meeting.title}
        description={`${MEETING_TYPE_LABELS[meeting.meetingType]} \u00b7 ${formatDate(meeting.meetingDate)}`}
        actions={<PrintButton />}
      />

      <Card className="print-block" data-print="block">
        <CardHeader
          title="Meeting details"
          action={
            <StatusBadge
              value={meeting.status}
              labels={MEETING_STATUS_LABELS}
              tones={MEETING_STATUS_BADGE}
            />
          }
        />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Date &amp; time">
              {formatDate(meeting.meetingDate)} &middot; {meeting.startTime}
              {meeting.endTime ? ` – ${meeting.endTime}` : ''}
            </Detail>
            <Detail label="Venue">
              <span className="inline-flex items-center gap-1.5">
                {meeting.venue ? (
                  <>
                    <MapPin className="h-3.5 w-3.5 text-navy-500" aria-hidden="true" />
                    {meeting.venue}
                  </>
                ) : (
                  '\u2014'
                )}
              </span>
            </Detail>
            <Detail label="Presiding officer">
              {meeting.presidingOfficer
                ? `${meeting.presidingOfficer.firstName} ${meeting.presidingOfficer.lastName}`
                : '\u2014'}
            </Detail>
            <Detail label="Recorded by">{meeting.createdBy.fullName}</Detail>
          </dl>

          {meeting.description ? (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-ink-soft">
              {meeting.description}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {minutes ? <Minutes minutes={minutes} /> : <NoMinutes />}

      <Card className="print-block" data-print="block">
        <CardBody><MeetingAttendance attendance={attendance} /></CardBody>
      </Card>

      {meeting.attendees.filter((row) => !row.memberId).length > 0 ? <Attendees rows={meeting.attendees.filter((row) => !row.memberId)} /> : null}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

function NoMinutes() {
  return (
    <Card>
      <CardBody className="p-0">
        <EmptyState
          title="Minutes not yet recorded"
          description="The Secretary has not published the minutes for this meeting."
        />
      </CardBody>
    </Card>
  );
}

function Minutes({ minutes }) {
  const sections = [
    ['Summary', minutes.summary],
    ['Agenda', minutes.agenda],
    ['Discussion', minutes.discussion],
    ['Resolutions', minutes.resolutions],
    ['Action items', minutes.actionItems],
  ].filter(([, value]) => value);

  return (
    <Card className="print-block" data-print="block">
      <CardHeader
        title={minutes.title}
        action={
          <StatusBadge
            value={minutes.status}
            labels={MINUTE_STATUS_LABELS}
            tones={MINUTE_STATUS_BADGE}
          />
        }
      />
      <CardBody>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Prepared by">{minutes.preparedByName}</Detail>
          <Detail label="Approved by">
            {minutes.approvedByName ?? 'Not yet approved'}
            {minutes.approvedAt ? ` \u00b7 ${formatDateTime(minutes.approvedAt)}` : ''}
          </Detail>
        </dl>

        <div className="mt-5 space-y-4">
          {sections.map(([label, value]) => (
            <div key={label}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {label}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {value}
              </p>
            </div>
          ))}
        </div>

        {minutes.attachments.length > 0 ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Attachments
            </h3>
            <ul className="mt-2 space-y-1">
              {minutes.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-medium text-navy-700 hover:underline"
                  >
                    {file.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Attendees({ rows }) {
  return (
    <Card className="print-block" data-print="block">
      <CardHeader title="Guests (manually recorded)" />
      <CardBody className="p-0">
        <SimpleTable
          rows={rows}
          rowKey="id"
          columns={[
            col('name', 'Name', { render: (r) => <span className="text-sm">{r.name}</span> }),
            col('position', 'Position', {
              render: (r) => <span className="text-xs">{r.position ?? '\u2014'}</span>,
            }),
            col('isPresent', 'Present', {
              align: 'center',
              render: (r) =>
                r.isPresent ? (
                  <Badge tone="bg-emerald-100 text-emerald-800 ring-emerald-200">Yes</Badge>
                ) : (
                  <Badge>No</Badge>
                ),
            }),
            col('remarks', 'Remarks', {
              render: (r) => <span className="text-[11px] text-ink-muted">{r.remarks ?? ''}</span>,
            }),
          ]}
        />
      </CardBody>
    </Card>
  );
}
