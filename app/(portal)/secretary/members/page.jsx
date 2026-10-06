import { UserCog } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams, textFilter } from '@/lib/queries';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import { previewNextMemberNumber } from '@/lib/member-id';
import {
  ACCOUNT_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_BADGE,
  MEMBERSHIP_STATUS_LABELS,
  ROLE_BADGE,
  ROLE_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { DownloadLinkSmall } from '@/components/ui/download-link';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { MemberFormModal } from '@/components/members/member-form';
import {
  EditMemberModal,
  MemberStatusButton,
} from '@/components/members/member-controls';

export const metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

// The filter is on MEMBERSHIP status (the register), not the linked account status.
const STATUS_OPTIONS = MEMBERSHIP_STATUSES.map((s) => ({
  value: s,
  label: MEMBERSHIP_STATUS_LABELS[s],
}));

export default async function SecretaryMembersPage({ searchParams }) {
  await requireRole('SECRETARY');
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value),
    defaultPageSize: 20,
  });

  const where = {
    ...(status ? { status } : {}),
    ...(textFilter(q, ['memberNumber', 'firstName', 'middleName', 'lastName', 'email']) ?? {}),
  };

  const [total, members, suggestedNumber] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy: { memberNumber: 'asc' },
      skip,
      take,
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        email: true,
        contactNumber: true,
        address: true,
        bloodType: true,
        birthday: true,
        dateJoined: true,
        emergencyName: true,
        emergencyPhone: true,
        notes: true,
        status: true,
        user: { select: { id: true, status: true, role: { select: { key: true } } } },
      },
    }),
    previewNextMemberNumber().catch(() => null),
  ]);

  const buildHref = (nextPage) =>
    `/secretary/members${buildQueryString({ ...params, page: nextPage })}`;
  const exportHref = `/api/reports/member-master${buildQueryString({ q, status })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Encode new members and maintain the club's member register."
        actions={
          <>
            <MemberFormModal suggestedNumber={suggestedNumber} />
            <DownloadLinkSmall href={exportHref} />
          </>
        }
      />

      <DataPanel
        title="Member register"
        description={`${total} member(s) match the current filter`}
        rows={members}
        emptyIcon={UserCog}
        emptyTitle="No members found"
        emptyDescription="Nothing matches the current search or status filter."
      >
        <FilterBar action="/secretary/members">
          <SearchInput defaultValue={q ?? ''} placeholder="Search name, ID or email…" />
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

        <MemberTable rows={members} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}

function MemberTable({ rows }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('memberNumber', 'Member ID', {
          render: (r) => (
            <span className="font-mono text-[11px] font-medium text-ink">{r.memberNumber}</span>
          ),
        }),
        col('name', 'Name', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{fullName(r)}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{r.email}</p>
            </>
          ),
        }),
        col('contactNumber', 'Contact', {
          render: (r) => <span className="text-xs text-ink-soft">{r.contactNumber ?? '\u2014'}</span>,
        }),
        col('dateJoined', 'Joined', {
          render: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.dateJoined)}</span>,
        }),
        col('status', 'Membership', {
          render: (r) => (
            <StatusBadge
              value={r.status}
              labels={MEMBERSHIP_STATUS_LABELS}
              tones={MEMBERSHIP_STATUS_BADGE}
            />
          ),
        }),
        col('account', 'Portal account', {
          render: (r) =>
            r.user ? (
              <>
                <Badge tone={ROLE_BADGE[r.user.role.key]}>{ROLE_LABELS[r.user.role.key]}</Badge>
                <p className="mt-1 text-[10px] text-ink-muted">
                  {ACCOUNT_STATUS_LABELS[r.user.status]}
                </p>
              </>
            ) : (
              <span className="text-[11px] text-ink-muted">Not created</span>
            ),
        }),
        col('actions', 'Actions', {
          align: 'right',
          render: (r) => (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <EditMemberModal member={r} />
              <MemberStatusButton member={r} />
            </div>
          ),
        }),
      ]}
    />
  );
}