import Link from 'next/link';
import { Activity, Settings, Shield, UserCog, UserCheck, UserX } from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { AUDIT_CATEGORY_LABELS, ROLE_BADGE, ROLE_LABELS } from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Card, CardBody, CardHeader, Badge } from '@/components/ui';
import { CardGrid, DataPanel, LinkRow, SimpleTable, col } from '@/components/dashboard/panels';

export const metadata = { title: 'Administrator Dashboard' };
export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/admin/users', label: 'User accounts', icon: UserCog },
  { href: '/admin/audit', label: 'Audit logs', icon: Shield },
  { href: '/admin/settings', label: 'System settings', icon: Settings },
];

export default async function AdminDashboardPage() {
  await requireRole('SYSTEM_ADMIN');
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [
    totalUsers,
    activeUsers,
    deactivatedUsers,
    lockedUsers,
    usersByRole,
    recentLogins,
    recentAudit,
    systemCounts,
    recentSecurity,
    roles,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.user.count({ where: { status: 'DEACTIVATED' } }),
    prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    prisma.user.groupBy({ by: ['roleId'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { lastLoginAt: { gte: dayAgo } },
      orderBy: { lastLoginAt: 'desc' },
      take: 8,
      select: {
        id: true,
        fullName: true,
        email: true,
        lastLoginAt: true,
        lastLoginIp: true,
        role: { select: { key: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        description: true,
        userEmail: true,
        category: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    Promise.all([
      prisma.member.count(),
      prisma.financialObligation.count(),
      prisma.financialTransaction.count(),
      prisma.attendanceRecord.count(),
      prisma.paymentSubmission.count(),
      prisma.officerAssignment.count(),
      prisma.auditLog.count(),
    ]),
    prisma.auditLog.findMany({
      where: { category: { in: ['AUTH', 'ADMIN'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, description: true, ipAddress: true, createdAt: true },
    }),
    prisma.role.findMany({ select: { id: true, key: true } }),
  ]);

  const byRole = roles
    .map((role) => ({
      key: role.key,
      count: usersByRole.find((row) => row.roleId === role.id)?._count._all ?? 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Administrator Dashboard"
        description="Account administration, system statistics and security activity."
      />

      <CardGrid
        cards={[
          {
            label: 'Total Users',
            value: totalUsers,
            hint: 'Non-deleted accounts',
            icon: UserCog,
            tone: 'navy',
          },
          { label: 'Active Users', value: activeUsers, hint: 'Can sign in', icon: UserCheck, tone: 'green' },
          {
            label: 'Deactivated Users',
            value: deactivatedUsers,
            hint: 'Retained for history',
            icon: UserX,
            tone: deactivatedUsers > 0 ? 'red' : 'slate',
          },
          {
            label: 'Locked Accounts',
            value: lockedUsers,
            hint: 'Too many failed logins',
            icon: Shield,
            tone: lockedUsers > 0 ? 'amber' : 'slate',
          },
        ]}
      />

      <LinkRow links={QUICK_LINKS} />

      <div className="grid gap-6 lg:grid-cols-3">
        <RoleBreakdown rows={byRole} total={totalUsers} />
        <SystemStatistics counts={systemCounts} />
      </div>

      <RecentSignIns rows={recentLogins} />

      <div className="grid gap-6 lg:grid-cols-2">
        <DataPanel
          title="Security events"
          description="Sign-ins, failed attempts and account changes."
          rows={recentSecurity}
          emptyIcon={Shield}
          emptyTitle="No security events yet"
          action={
            <Link href="/admin/audit" className="text-xs font-medium text-navy-700 hover:underline">
              View all
            </Link>
          }
        >
          <AuditList rows={recentSecurity} showCategory={false} />
        </DataPanel>

        <DataPanel
          title="Latest audit activity"
          description="Every sensitive action is recorded permanently."
          rows={recentAudit}
          emptyIcon={Activity}
          emptyTitle="No audit entries yet"
          action={
            <Link href="/admin/audit" className="text-xs font-medium text-navy-700 hover:underline">
              View all
            </Link>
          }
        >
          <AuditList rows={recentAudit} showCategory />
        </DataPanel>
      </div>
    </div>
  );
}

function RoleBreakdown({ rows, total }) {
  return (
    <Card>
      <CardHeader title="Users by role" />
      <CardBody className="space-y-2 p-4">
        {rows.length === 0 ? (
          <p className="text-xs text-ink-muted">No users yet.</p>
        ) : (
          rows.map((row) => {
            const percent = total > 0 ? Math.round((row.count / total) * 100) : 0;
            return (
              <div key={row.key}>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={ROLE_BADGE[row.key]}>{ROLE_LABELS[row.key]}</Badge>
                  <span className="text-xs font-semibold tabular-nums text-ink">
                    {row.count} ({percent}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-navy-700" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

function SystemStatistics({ counts }) {
  const [members, obligations, transactions, attendanceRecords, submissions, officers, auditRows] =
    counts;
  const rows = [
    { label: 'Members', value: members },
    { label: 'Financial obligations', value: obligations },
    { label: 'Ledger transactions', value: transactions },
    { label: 'Attendance records', value: attendanceRecords },
    { label: 'Payment submissions', value: submissions },
    { label: 'Officer assignments', value: officers },
    { label: 'Audit log entries', value: auditRows },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="System statistics" description="Record counts across the database." />
      <CardBody className="p-0">
        <SimpleTable
          rowKey="label"
          rows={rows}
          columns={[
            col('label', 'Entity'),
            col('value', 'Count', { align: 'right', render: (r) => r.value.toLocaleString() }),
          ]}
        />
      </CardBody>
    </Card>
  );
}

function RecentSignIns({ rows }) {
  return (
    <DataPanel
      title="Recent sign-ins (last 24 hours)"
      rows={rows}
      emptyIcon={UserCheck}
      emptyTitle="No sign-ins in the last 24 hours"
    >
      <SimpleTable
        rows={rows}
        columns={[
          col('fullName', 'User', {
            render: (r) => (
              <>
                <p className="font-medium text-ink">{r.fullName}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{r.email}</p>
              </>
            ),
          }),
          col('role', 'Role', {
            render: (r) => <Badge tone={ROLE_BADGE[r.role.key]}>{ROLE_LABELS[r.role.key]}</Badge>,
          }),
          col('lastLoginIp', 'IP', {
            render: (r) => <span className="font-mono text-[11px]">{r.lastLoginIp ?? '\u2014'}</span>,
          }),
          col('lastLoginAt', 'When', {
            render: (r) => (
              <span className="whitespace-nowrap text-xs text-ink-muted">
                {formatRelative(r.lastLoginAt)}
              </span>
            ),
          }),
        ]}
      />
    </DataPanel>
  );
}

function AuditList({ rows, showCategory }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((entry) => (
        <li key={entry.id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-ink">{entry.action}</span>
            <span className="whitespace-nowrap text-[11px] text-ink-muted">
              {formatDateTime(entry.createdAt)}
            </span>
          </div>
          {entry.description ? (
            <p className="mt-0.5 text-[11px] text-ink-muted">{entry.description}</p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-ink-muted">
            {entry.userEmail ?? 'system'}
            {showCategory && entry.category
              ? ` \u00b7 ${AUDIT_CATEGORY_LABELS[entry.category]}`
              : ''}
            {entry.ipAddress ? ` \u00b7 ${entry.ipAddress}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}