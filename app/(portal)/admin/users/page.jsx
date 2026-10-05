import { UserCog, UserPlus } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { buildQueryString, formatRelative, fullName } from '@/lib/utils';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_BADGE,
  ACCOUNT_STATUS_LABELS,
  ROLE_BADGE,
  ROLE_LABELS,
  ROLE_LIST,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { UserAdminControls } from '@/components/admin/user-controls';
import { CreateUserModal } from '@/components/admin/create-user-modal';
import { EditUserModal } from '@/components/admin/edit-user-modal';

export const metadata = { title: 'User Accounts' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = ACCOUNT_STATUSES.map((s) => ({
  value: s,
  label: ACCOUNT_STATUS_LABELS[s],
}));

const ROLE_OPTIONS = ROLE_LIST.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function AdminUsersPage({ searchParams }) {
  const currentUser = await requireRole('SYSTEM_ADMIN');
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, {
    defaultPageSize: 20,
  });
  const role = ROLE_LIST.includes(params?.role) ? params.role : null;

  const where = {
    ...(status ? { status } : {}),
    ...(role ? { role: { key: role } } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, users, memberRows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { email: 'asc' },
      skip,
      take,
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        mustChangePassword: true,
        member: { select: { id: true, memberNumber: true } },
        role: { select: { key: true } },
      },
    }),
    prisma.member.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
      take: 500,
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
      },
    }),
  ]);

  const buildHref = (nextPage) =>
    `/admin/users${buildQueryString({ ...params, page: nextPage })}`;

  const linkableMembers = memberRows.map((m) => ({
    id: m.id,
    name: fullName(m),
    memberNumber: m.memberNumber,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Accounts"
        description="Create accounts, assign roles and control access. Deactivated accounts keep their history and cannot sign in."
        actions={<CreateUserModal />}
      />

      <DataPanel
        title="Accounts"
        description={`${total} account(s) match the current filter`}
        rows={users}
        emptyIcon={UserCog}
        emptyTitle="No accounts found"
        emptyDescription="Nothing matches the current search or filter."
      >
        <FilterBar action="/admin/users">
          <SearchInput defaultValue={q ?? ''} placeholder="Search name or email…" />
          <SelectFilter
            name="status"
            value={status ?? ''}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <SelectFilter name="role" value={role ?? ''} options={ROLE_OPTIONS} placeholder="All roles" />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-800 px-3 text-xs font-medium text-white hover:bg-navy-900"
          >
            Filter
          </button>
        </FilterBar>

        <UserTable
          rows={users}
          currentUserId={currentUser.id}
          linkableMembers={linkableMembers}
        />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>
    </div>
  );
}

function UserTable({ rows, currentUserId, linkableMembers }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('user', 'User', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{r.fullName}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{r.email}</p>
              {r.member ? (
                <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                  {r.member.memberNumber}
                </p>
              ) : null}
            </>
          ),
        }),
        col('role', 'Role', {
          render: (r) => <Badge tone={ROLE_BADGE[r.role.key]}>{ROLE_LABELS[r.role.key]}</Badge>,
        }),
        col('status', 'Status', {
          render: (r) => (
            <>
              <StatusBadge
                value={r.status}
                labels={ACCOUNT_STATUS_LABELS}
                tones={ACCOUNT_STATUS_BADGE}
              />
              {r.lockedUntil ? (
                <p className="mt-1 text-[10px] font-medium text-amber-700">Locked</p>
              ) : null}
              {r.mustChangePassword ? (
                <p className="mt-1 text-[10px] text-ink-muted">Password change pending</p>
              ) : null}
            </>
          ),
        }),
        col('lastLoginAt', 'Last sign-in', {
          render: (r) => (
            <span className="whitespace-nowrap text-xs text-ink-muted">
              {r.lastLoginAt ? formatRelative(r.lastLoginAt) : 'Never'}
            </span>
          ),
        }),
        col('action', 'Actions', {
          align: 'right',
          render: (r) => (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <EditUserModal
                  user={r}
                  members={linkableMembers}
                  isSelf={r.id === currentUserId}
                />
                <UserAdminControls user={r} currentUserId={currentUserId} />
              </div>
            ),
        }),
      ]}
    />
  );
}