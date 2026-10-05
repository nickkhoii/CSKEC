import { Users } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { buildQueryString, formatDate, fullName } from '@/lib/utils';
import {
  ACCOUNT_STATUS_LABELS,
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_BADGE,
  MEMBERSHIP_STATUS_LABELS,
  ROLE_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { DownloadLink } from '@/components/ui/download-link';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';

export const metadata = { title: 'Member Master List' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = MEMBERSHIP_STATUSES.map((s) => ({
  value: s,
  label: MEMBERSHIP_STATUS_LABELS[s],
}));

/**
 * Printable member master list. The permission gate is report:member_master,
 * which the Secretary, Treasurer and President all hold - but a plain Club Member
 * never reaches this page even with a hand-crafted URL.
 */
export default async function MemberMasterReportPage({ searchParams }) {
  await requirePermission(PERMISSIONS.REPORT_MEMBER_MASTER);
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, {
    defaultPageSize: 50,
  });

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { memberNumber: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { middleName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, members] = await Promise.all([
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
        email: true,
        contactNumber: true,
        dateJoined: true,
        status: true,
        bloodType: true,
        emergencyName: true,
        emergencyPhone: true,
        user: { select: { email: true, status: true, role: { select: { key: true } } } },
      },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/reports/member-master${buildQueryString({ ...params, page: nextPage })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Member Master List"
        description="The complete club register with portal-account linkage. Suitable for printing and CSV export."
        actions={
          <>
            <DownloadLink href={`/api/reports/member-master${buildQueryString({ q, status })}`} />
            <PrintButton />
          </>
        }
      />

      <DataPanel
        title="Register"
        description={`${total} member(s) match the current filter`}
        rows={members}
        emptyIcon={Users}
        emptyTitle="No members found"
      >
        <FilterBar action="/reports/member-master">
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

        <SimpleTable
          rows={members}
          columns={[
            col('memberNumber', 'Member ID', {
              render: (r) => (
                <span className="font-mono text-[11px] font-medium">{r.memberNumber}</span>
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
              render: (r) => <span className="text-xs">{r.contactNumber ?? '\u2014'}</span>,
            }),
            col('dateJoined', 'Joined', {
              render: (r) => (
                <span className="whitespace-nowrap text-xs">{formatDate(r.dateJoined)}</span>
              ),
            }),
            col('bloodType', 'Blood', {
              render: (r) => <span className="text-xs">{r.bloodType ?? '\u2014'}</span>,
            }),
            col('emergency', 'Emergency', {
              render: (r) => (
                <>
                  <p className="text-xs">{r.emergencyName ?? '\u2014'}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{r.emergencyPhone ?? ''}</p>
                </>
              ),
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
                    <Badge tone="bg-navy-100 text-navy-800 ring-navy-200">
                      {ROLE_LABELS[r.user.role.key]}
                    </Badge>
                    <p className="mt-1 text-[10px] text-ink-muted">
                      {ACCOUNT_STATUS_LABELS[r.user.status]}
                    </p>
                  </>
                ) : (
                  <span className="text-[11px] text-ink-muted">Not created</span>
                ),
            }),
          ]}
        />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}
