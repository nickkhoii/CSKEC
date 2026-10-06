import { CalendarCheck, Filter } from 'lucide-react';
import { requireRole, can, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { fullName } from '@/lib/utils';
import { buildQueryString, formatDateTime, formatRelative } from '@/lib/utils';
import {
  ACTIVITY_TYPE_LABELS,
  ATTENDANCE_REQUEST_STATUS_BADGE,
  ATTENDANCE_REQUEST_STATUS_LABELS,
  ATTENDANCE_RECORD_STATUS_BADGE,
  ATTENDANCE_RECORD_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { AttendanceReviewButtons } from '@/components/approvals/attendance-review';
import { ManualRollCall } from '@/components/approvals/manual-roll-call';

export const metadata = { title: 'Attendance Review' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Withdrawn' },
];

export default async function SecretaryAttendancePage({ searchParams }) {
  const reviewer = await requireRole('SECRETARY');
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value),
    defaultPageSize: 20,
  });
  const canRecordManual = await can(PERMISSIONS.ATTENDANCE_RECORD_MANUAL);

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { member: { memberNumber: { contains: q, mode: 'insensitive' } } },
            { member: { firstName: { contains: q, mode: 'insensitive' } } },
            { member: { lastName: { contains: q, mode: 'insensitive' } } },
            { memberRemarks: { contains: q, mode: 'insensitive' } },
            { activity: { title: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  // Resolve the roll-call permission BEFORE the query below: referencing
  // `canRollCall` inside the same destructuring statement that declares it hits
  // the temporal dead zone and throws a ReferenceError.
  const canRollCall = canRecordManual;

  const [total, requests, records, rollCallActivities, rollCallMemberRows] =
    await Promise.all([
    prisma.attendanceRequest.count({ where }),
    prisma.attendanceRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        status: true,
        memberRemarks: true,
        reviewRemarks: true,
        submittedAt: true,
        reviewedBy: { select: { fullName: true } },
        member: {
          select: { id: true, firstName: true, middleName: true, lastName: true, memberNumber: true },
        },
        activity: { select: { id: true, title: true, type: true, startsAt: true } },
        attendanceRecord: { select: { id: true, status: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      orderBy: { approvedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        hoursCredited: true,
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        activity: { select: { title: true } },
        approvedBy: { select: { fullName: true } },
      },
    }),
    canRollCall
      ? prisma.activity.findMany({
          where: { requiresAttendance: true },
          orderBy: { startsAt: 'desc' },
          take: 100,
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    canRollCall
      ? prisma.member.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { lastName: 'asc' },
          take: 500,
          select: {
            id: true,
            memberNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            attendanceRecords: { select: { activityId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const activities = rollCallActivities;
  const rollCallMembers = rollCallMemberRows.map((m) => ({
    id: m.id,
    memberNumber: m.memberNumber,
    name: fullName(m),
    recordedActivityIds: m.attendanceRecords.map((r) => r.activityId),
  }));

  // A reviewer may never approve their own request.
  const canReview = (request) => !reviewer.memberId || reviewer.memberId !== request.member.id;
  const buildHref = (nextPage) =>
    `/secretary/attendance${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Review"
        description="Verify member attendance requests. Approving creates the official record and credits community service hours."
        actions={
          canRecordManual ? (
            <ManualRollCall
              activities={activities}
              members={rollCallMembers}
              preSelectedActivityId={params?.activity ?? ''}
            />
          ) : null
        }
      />

      <DataPanel
        title="Attendance requests"
        description={`${total} request(s) match the current filter`}
        rows={requests}
        emptyIcon={CalendarCheck}
        emptyTitle="No attendance requests"
        emptyDescription="Nothing matches the current search or status filter."
      >
        <FilterBar action="/secretary/attendance">
          <SearchInput defaultValue={q ?? ''} placeholder="Search member or activity…" />
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
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Filter
          </button>
        </FilterBar>

        <RequestTable rows={requests} canReview={canReview} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>

      <RecentRecords rows={records} />
    </div>
  );
}

function RequestTable({ rows, canReview }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('member', 'Member', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{fullName(r.member)}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{r.member.memberNumber}</p>
            </>
          ),
        }),
        col('activity', 'Activity', {
          render: (r) => (
            <>
              <p className="text-xs font-medium text-ink">{r.activity.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {ACTIVITY_TYPE_LABELS[r.activity.type]} &middot;{' '}
                {formatDateTime(r.activity.startsAt)}
              </p>
            </>
          ),
        }),
        col('memberRemarks', 'Member note', {
          render: (r) => (
            <span className="block max-w-[14rem] text-[11px] text-ink-muted">
              {r.memberRemarks ?? '\u2014'}
            </span>
          ),
        }),
        col('status', 'Status', {
          render: (r) => (
            <>
              <StatusBadge
                value={r.status}
                labels={ATTENDANCE_REQUEST_STATUS_LABELS}
                tones={ATTENDANCE_REQUEST_STATUS_BADGE}
              />
              {r.attendanceRecord ? (
                <p className="mt-1 text-[10px] text-emerald-700">
                  Recorded: {ATTENDANCE_RECORD_STATUS_LABELS[r.attendanceRecord.status]}
                </p>
              ) : null}
              {r.reviewRemarks ? (
                <p className="mt-1 max-w-[12rem] text-[10px] text-ink-muted">{r.reviewRemarks}</p>
              ) : null}
            </>
          ),
        }),
        col('submittedAt', 'Submitted', {
          render: (r) => (
            <span className="whitespace-nowrap text-[11px] text-ink-muted">
              {formatRelative(r.submittedAt)}
            </span>
          ),
        }),
        col('action', 'Decision', {
          align: 'right',
          render: (r) =>
            r.status !== 'PENDING' ? (
              <span className="text-[11px] text-ink-muted">
                {r.reviewedBy ? `by ${r.reviewedBy.fullName}` : 'Reviewed'}
              </span>
            ) : (
              <AttendanceReviewButtons
                requestId={r.id}
                disabled={!canReview(r)}
                disabledReason="You cannot review your own request"
              />
            ),
        }),
      ]}
    />
  );
}

function RecentRecords({ rows }) {
  return (
    <DataPanel
      title="Recently recorded attendance"
      description="Official records created by the Secretary."
      rows={rows}
      emptyIcon={CalendarCheck}
      emptyTitle="No official records yet"
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
          col('status', 'Result', {
            render: (r) => (
              <StatusBadge
                value={r.status}
                labels={ATTENDANCE_RECORD_STATUS_LABELS}
                tones={ATTENDANCE_RECORD_STATUS_BADGE}
              />
            ),
          }),
          col('hoursCredited', 'Hours', {
            align: 'right',
            render: (r) => (
              <span className="text-xs tabular-nums">
                {r.hoursCredited ? Number(r.hoursCredited).toFixed(2) : '\u2014'}
              </span>
            ),
          }),
          col('approvedBy', 'Approved by', {
            render: (r) => <span className="text-xs">{r.approvedBy?.fullName ?? '\u2014'}</span>,
          }),
        ]}
      />
    </DataPanel>
  );
}