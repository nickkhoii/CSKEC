import { BookOpen, CalendarClock } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams, textFilter } from '@/lib/queries';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import {
  MEETING_STATUSES,
  MEETING_STATUS_BADGE,
  MEETING_STATUS_LABELS,
  MEETING_TYPES,
  MEETING_TYPE_LABELS,
  MINUTE_STATUS_BADGE,
  MINUTE_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { CreateMeetingModal, MinuteEditorModal } from '@/components/content/meeting-modals';

export const metadata = { title: 'Meeting Minutes' };
export const dynamic = 'force-dynamic';

const TYPE_OPTIONS = MEETING_TYPES.map((t) => ({ value: t, label: MEETING_TYPE_LABELS[t] }));
const STATUS_OPTIONS = MEETING_STATUSES.map((s) => ({ value: s, label: MEETING_STATUS_LABELS[s] }));

export default async function SecretaryMeetingsPage({ searchParams }) {
  await requirePermission(PERMISSIONS.MINUTE_MANAGE);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value), defaultPageSize: 20 });
  const type = MEETING_TYPES.includes(params?.type) ? params.type : null;

  const where = {
    ...(status ? { status } : {}),
    ...(type ? { meetingType: type } : {}),
    ...(textFilter(q, ['title', 'venue', 'description']) ?? {}),
  };

  const [total, meetings, officers, activities] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      orderBy: { meetingDate: 'desc' },
      skip,
      take,
      select: {
        id: true,
        title: true,
        meetingType: true,
        meetingDate: true,
        startTime: true,
        endTime: true,
        description: true,
        activityId: true,
        presidingOfficerId: true,
        venue: true,
        status: true,
        presidingOfficer: { select: { firstName: true, middleName: true, lastName: true } },
        minutes: true,
        _count: { select: { attendees: true } },
      },
    }),
    prisma.member.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
      take: 200,
      select: { id: true, firstName: true, middleName: true, lastName: true },
    }),
    prisma.activity.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: { id: true, title: true },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/secretary/meetings${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meeting Minutes"
        description="Schedule meetings and maintain the official minutes record. Draft minutes stay hidden from members."
        actions={
          <>
            <CreateMeetingModal
              officers={officers.map((o) => ({ id: o.id, name: fullName(o) }))}
              activities={activities}
            />
            <PrintButton />
          </>
        }
      />

      <DataPanel
        title="All meetings"
        description={`${total} meeting(s) match the current filter`}
        rows={meetings}
        emptyIcon={CalendarClock}
        emptyTitle="No meetings yet"
        emptyDescription="Schedule the club's first meeting."
      >
        <FilterBar action="/secretary/meetings">
          <SearchInput defaultValue={q ?? ''} placeholder="Search title or venueâ€¦" />
          <SelectFilter name="type" value={type ?? ''} options={TYPE_OPTIONS} placeholder="All types" />
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

        <MeetingTable rows={meetings} officers={officers.map((o) => ({ id: o.id, name: fullName(o) }))} activities={activities} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>

      <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Only a role holding <code className="font-mono">minute:approve</code> may mark minutes as
        approved; the server rejects the request otherwise.
      </p>
    </div>
  );
}

function MeetingTable({ rows, officers, activities }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('title', 'Meeting', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {MEETING_TYPE_LABELS[r.meetingType]}
                {r.presidingOfficer ? ` \u00b7 ${fullName(r.presidingOfficer)}` : ''}
                {r._count.attendees > 0 ? ` \u00b7 ${r._count.attendees} attendee(s)` : ''}
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
        col('status', 'Meeting', {
          render: (r) => (
            <StatusBadge
              value={r.status}
              labels={MEETING_STATUS_LABELS}
              tones={MEETING_STATUS_BADGE}
            />
          ),
        }),
        col('minutes', 'Minutes', {
          render: (r) =>
            r.minutes ? (
              <>
                <StatusBadge
                  value={r.minutes.status}
                  labels={MINUTE_STATUS_LABELS}
                  tones={MINUTE_STATUS_BADGE}
                />
                <a
                  href={`/meetings/${r.id}`}
                  className="mt-1 block text-[11px] font-medium text-navy-700 hover:underline"
                >
                  View
                </a>
              </>
            ) : (
              <span className="text-[11px] text-ink-muted">Not written</span>
            ),
        }),
        col('actions', 'Minutes', {
          align: 'right',
          render: (r) => <div className="flex justify-end gap-2"><CreateMeetingModal meeting={r} officers={officers} activities={activities} /><MinuteEditorModal meeting={r} minutes={r.minutes} /></div>,
        }),
      ]}
    />
  );
}
