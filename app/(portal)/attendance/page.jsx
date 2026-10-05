import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarCheck, Info } from 'lucide-react';
import { requireCurrentMember, requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { evaluateRequestEligibility, memberAttendanceSummary } from '@/lib/attendance';
import { listActivitiesWithMyStatus } from '@/lib/queries';
import { SETTING_KEYS, getNumberSetting, getSetting } from '@/lib/settings';
import { formatDateTime, formatDate } from '@/lib/utils';
import {
  ACTIVITY_TYPE_LABELS,
  ATTENDANCE_RECORD_STATUS_BADGE,
  ATTENDANCE_RECORD_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from '@/components/ui';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PresentButton } from '@/components/member/attendance-controls';

export const metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const user = await requireUser();
  if (!user.memberId) redirect('/profile');

  const member = await requireCurrentMember();
  const windowDays = getNumberSetting(await getSetting(SETTING_KEYS.ATTENDANCE_WINDOW_DAYS), 7);

  const [activities, summary, history] = await Promise.all([
    listActivitiesWithMyStatus(member.id),
    memberAttendanceSummary(member.id),
    prisma.attendanceRecord.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        hoursCredited: true,
        approvedAt: true,
        source: true,
        activity: {
          select: {
            id: true,
            title: true,
            type: true,
            startsAt: true,
            category: true,
            approvedBy: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  // Split into "open" and "closed" using the same eligibility rule the server
  // action enforces, so the button state can never disagree with the backend.
  const open = [];
  for (const activity of activities) {
    const eligibility = evaluateRequestEligibility({
      activity: {
        status: 'PUBLISHED',
        requiresAttendance: true,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
      },
      existingRequest: activity.request,
      record: activity.record,
      windowDays,
    });
    const canSubmit =
      (activity.status === 'NOT_SUBMITTED' || activity.status === 'REJECTED') && eligibility.allowed;
    open.push({
      ...activity,
      canSubmit,
      disabledReason: canSubmit ? null : eligibility.reason ?? 'No further submission is possible',
    });
  }

  const stats = [
    { label: 'Attendance Rate', value: `${summary.attendanceRate}%`, hint: 'Present / late vs all recorded' },
    { label: 'Recorded Events', value: summary.totalRecords, hint: 'Official attendance records' },
    {
      label: 'Community Service Hours',
      value: summary.totalHours,
      hint: `${summary.communityServiceHours} from CS activities`,
    },
    {
      label: 'Pending Requests',
      value: summary.pendingRequests,
      hint: 'Awaiting Secretary verification',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description="Submit PRESENT for meetings and activities. Your request is verified by the Secretary before it becomes an official record."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((card) => (
          <Card key={card.label} className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{card.value}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">{card.hint}</p>
          </Card>
        ))}
      </div>

      <Alert tone="info" title="How attendance works">
        Clicking <strong>Present</strong> submits a request &mdash; it does not record you as
        present immediately. The club Secretary reviews the request and either approves it
        (creating an official record) or rejects it with a reason. You may only have one request
        per activity.
      </Alert>

      <Card>
        <CardHeader
          title="Eligible meetings &amp; activities"
          description={`Requests close ${windowDays} day(s) after the activity ends.`}
        />
        <CardBody className="p-0">
          <AttendanceRows rows={open} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Official attendance history"
          description="Records created by the Secretary after verifying your request."
        />
        <CardBody className="p-0">
          <AttendanceHistory rows={history} />
        </CardBody>
      </Card>
    </div>
  );
}

function AttendanceRows({ rows }) {
  const actionable = rows.filter(
    (row) => row.canSubmit || ['PENDING', 'APPROVED', 'RECORDED'].includes(row.status),
  );

  if (actionable.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No activities available"
        description="There are currently no meetings or activities you can submit attendance for."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Activity</TH>
          <TH>Date</TH>
          <TH>Venue</TH>
          <TH>Status</TH>
          <TH align="right">Action</TH>
        </TR>
      </THead>
      <TBody>
        {actionable.map((row) => (
          <TR key={row.id}>
            <TD>
              <p className="font-medium text-ink">{row.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{ACTIVITY_TYPE_LABELS[row.type]}</p>
            </TD>
            <TD className="whitespace-nowrap text-xs">{formatDateTime(row.startsAt)}</TD>
            <TD className="text-xs text-ink-soft">{row.venue ?? '\u2014'}</TD>
            <TD>
              <AttendanceStatus
                status={row.status}
                recordStatus={row.record?.status}
                remarks={row.request?.reviewRemarks}
              />
            </TD>
            <TD align="right">
              <PresentButton
                activityId={row.id}
                status={row.status}
                requestId={row.request?.id}
                disabled={!row.canSubmit && row.status !== 'PENDING'}
                disabledReason={row.disabledReason}
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function AttendanceStatus({ status, recordStatus, remarks }) {
  if (status === 'RECORDED') {
    return (
      <StatusBadge
        value={recordStatus}
        labels={ATTENDANCE_RECORD_STATUS_LABELS}
        tones={ATTENDANCE_RECORD_STATUS_BADGE}
      />
    );
  }
  if (status === 'NOT_SUBMITTED') return <Badge>Not Submitted</Badge>;

  const tone =
    status === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
      : status === 'REJECTED'
        ? 'bg-rose-100 text-rose-800 ring-rose-200'
        : 'bg-amber-100 text-amber-900 ring-amber-200';

  return (
    <>
      <Badge tone={tone}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
      {status === 'REJECTED' && remarks ? (
        <p className="mt-1 max-w-xs text-[11px] text-rose-700">{remarks}</p>
      ) : null}
    </>
  );
}

function AttendanceHistory({ rows }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="No official records yet"
        description="Once the Secretary approves one of your requests it will appear here."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Activity</TH>
          <TH>Date</TH>
          <TH>Result</TH>
          <TH align="right">Hours</TH>
          <TH>Approved by</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((record) => (
          <TR key={record.id}>
            <TD>
              <p className="font-medium text-ink">{record.activity.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {ACTIVITY_TYPE_LABELS[record.activity.type]}
              </p>
            </TD>
            <TD className="whitespace-nowrap text-xs">{formatDate(record.activity.startsAt)}</TD>
            <TD>
              <StatusBadge
                value={record.status}
                labels={ATTENDANCE_RECORD_STATUS_LABELS}
                tones={ATTENDANCE_RECORD_STATUS_BADGE}
              />
            </TD>
            <TD align="right" className="text-xs tabular-nums">
              {record.hoursCredited ? Number(record.hoursCredited).toFixed(2) : '\u2014'}
            </TD>
            <TD className="text-xs text-ink-soft">{record.activity.approvedBy?.fullName ?? '\u2014'}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}