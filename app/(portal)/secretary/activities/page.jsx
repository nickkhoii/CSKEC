import { ClipboardList } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams, textFilter } from '@/lib/queries';
import { buildQueryString, formatDateTime } from '@/lib/utils';
import { formatPeso } from '@/lib/money';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  PUBLICATION_STATUS_BADGE,
  PUBLICATION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import {
  ActivityStatusControls,
  CreateActivityModal,
} from '@/components/content/activity-modals';

export const metadata = { title: 'Activities' };
export const dynamic = 'force-dynamic';

const TYPE_OPTIONS = ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_TYPE_LABELS[t] }));
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export default async function SecretaryActivitiesPage({ searchParams }) {
  await requirePermission(PERMISSIONS.ACTIVITY_MANAGE);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value), defaultPageSize: 20 });
  const type = ACTIVITY_TYPES.includes(params?.type) ? params.type : null;

  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(textFilter(q, ['title', 'description', 'venue']) ?? {}),
  };

  const [total, activities] = await Promise.all([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        address: true,
        type: true,
        startsAt: true,
        endsAt: true,
        venue: true,
        requiresAttendance: true,
        creditsHours: true,
        feeAmount: true,
        capacity: true,
        status: true,
        _count: { select: { attendanceRecords: true, attendanceRequests: true } },
      },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/secretary/activities${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activities"
        description="Attendance-tracked events. Publishing an activity makes it visible for PRESENT requests."
        actions={<CreateActivityModal />}
      />

      <DataPanel
        title="All activities"
        description={`${total} activity(ies) match the current filter`}
        rows={activities}
        emptyIcon={ClipboardList}
        emptyTitle="No activities yet"
        emptyDescription="Schedule the club's first attendance-tracked event."
      >
        <FilterBar action="/secretary/activities">
          <SearchInput defaultValue={q ?? ''} placeholder="Search title or venue…" />
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

        <ActivityTable rows={activities} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}

function ActivityTable({ rows }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('title', 'Activity', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{r.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {ACTIVITY_TYPE_LABELS[r.type]}
                {r.venue ? ` · ${r.venue}` : ''}
              </p>
            </>
          ),
        }),
        col('startsAt', 'Schedule', {
          render: (r) => (
            <span className="whitespace-nowrap text-xs">{formatDateTime(r.startsAt)}</span>
          ),
        }),
        col('creditsHours', 'Credits', {
          align: 'right',
          render: (r) => (
            <span className="text-xs tabular-nums">
              {r.creditsHours ? Number(r.creditsHours).toFixed(2) : '—'}
            </span>
          ),
        }),
        col('feeAmount', 'Fee', {
          align: 'right',
          render: (r) => (
            <span className="text-xs tabular-nums">
              {r.feeAmount ? formatPeso(r.feeAmount) : '—'}
            </span>
          ),
        }),
        col('attendance', 'Attendance', {
          render: (r) =>
            r.requiresAttendance ? (
              <>
                <p className="text-xs font-medium text-ink">
                  {r._count.attendanceRecords} recorded
                </p>
                {r._count.attendanceRequests > 0 ? (
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    {r._count.attendanceRequests} request(s) in total
                  </p>
                ) : null}
              </>
            ) : (
              <Badge tone="bg-slate-100 text-slate-700 ring-slate-200">Not tracked</Badge>
            ),
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
        col('actions', 'Actions', {
          align: 'right',
          render: (r) => <ActivityStatusControls activity={{ ...r, creditsHours: r.creditsHours == null ? null : Number(r.creditsHours), feeAmount: r.feeAmount == null ? null : Number(r.feeAmount) }} />,
        }),
      ]}
    />
  );
}
