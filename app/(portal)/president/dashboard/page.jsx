import {
  BarChart3,
  CalendarClock,
  FileSpreadsheet,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { listCurrentOfficers } from '@/lib/officers';
import { cashFlowSummary, delinquencySummary, monthlyCashFlowSeries } from '@/lib/finance';
import { formatPeso, moneyToNumber } from '@/lib/money';
import { formatDate, formatRelative, truncate } from '@/lib/utils';
import { POST_CATEGORY_BADGE, POST_CATEGORY_SHORT } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { CardGrid, LinkRow, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { IncomeExpenseChart } from '@/components/dashboard/income-expense-chart';

export const metadata = { title: 'President Dashboard' };
export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  { href: '/president/officers', label: 'Officer assignments', icon: ShieldCheck },
  { href: '/president/overview', label: 'Club overview', icon: BarChart3 },
  { href: '/reports/member-master', label: 'Member master list', icon: Users },
  { href: '/reports/cash-flow', label: 'Cash flow report', icon: FileSpreadsheet },
];

export default async function PresidentDashboardPage() {
  await requireRole('PRESIDENT');
  const now = new Date();

  const [activeMembers, officers, upcomingMeetings, recentUpdates, cash, delinquency, series] =
    await Promise.all([
      prisma.member.count({ where: { status: 'ACTIVE' } }),
      listCurrentOfficers(),
      prisma.meeting.findMany({
        where: { status: 'SCHEDULED', meetingDate: { gte: now } },
        orderBy: { meetingDate: 'asc' },
        take: 5,
        select: { id: true, title: true, meetingDate: true, venue: true },
      }),
      prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, category: true, publishedAt: true },
      }),
      cashFlowSummary(),
      delinquencySummary(now),
      monthlyCashFlowSeries({ months: 12 }),
    ]);

  const filled = officers.filter((office) => office.assignment);
  const vacancies = officers.filter((office) => !office.assignment);

  return (
    <div className="space-y-6">
      <PageHeader
        title="President Dashboard"
        description="Read-only view of club operations, current officers and financial position."
        actions={<PrintButton />}
      />

      <CardGrid
        cards={[
          { label: 'Active Members', value: activeMembers, hint: 'Registered club members', icon: Users, tone: 'navy' },
          {
            label: 'Offices Filled',
            value: `${filled.length}/${officers.length}`,
            hint: vacancies.length ? `${vacancies.length} vacant` : 'All offices filled',
            icon: ShieldCheck,
            tone: vacancies.length ? 'amber' : 'green',
          },
          { label: 'Club Funds', value: formatPeso(cash.currentBalance), hint: 'Beginning balance + net cash flow', icon: TrendingUp, tone: 'green' },
          {
            label: 'Outstanding Dues',
            value: formatPeso(delinquency.totalOutstanding),
            hint: `${delinquency.delinquentMembers} delinquent member(s)`,
            icon: BarChart3,
            tone: moneyToNumber(delinquency.totalOutstanding) > 0 ? 'amber' : 'green',
          },
        ]}
      />

      <LinkRow links={QUICK_LINKS} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OfficersPanel officers={officers} />
        </div>
        <MeetingsPanel rows={upcomingMeetings} />
      </div>

      <IncomeExpenseChart data={series} />

      <DataPanel
        title="Recent club updates"
        action={
          <a href="/updates" className="text-xs font-medium text-navy-700 hover:underline">
            View all
          </a>
        }
        rows={recentUpdates}
        emptyIcon={Megaphone}
        emptyTitle="No published updates yet"
      >
        <ul className="divide-y divide-slate-100">
          {recentUpdates.map((post) => (
            <li key={post.id}>
              <a href={`/updates/${post.id}`} className="block px-5 py-3 hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={POST_CATEGORY_BADGE[post.category]}>
                    {POST_CATEGORY_SHORT[post.category]}
                  </Badge>
                  <span className="text-[11px] text-ink-muted">
                    {formatRelative(post.publishedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{truncate(post.title, 80)}</p>
              </a>
            </li>
          ))}
        </ul>
      </DataPanel>
    </div>
  );
}

function OfficersPanel({ officers }) {
  return (
    <Card>
      <CardHeader
        title="Current club officers"
        description="Officer terms are retained permanently in the register."
        action={
          <a href="/president/officers" className="text-xs font-medium text-navy-700 hover:underline">
            Manage
          </a>
        }
      />
      <CardBody className="p-0">
        {officers.length === 0 ? (
          <EmptyState title="No offices configured" />
        ) : (
          <SimpleTable
            rows={officers}
            rowKey="code"
            columns={[
              col('name', 'Office', {
                render: (r) => (
                  <>
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">{r.code}</p>
                  </>
                ),
              }),
              col('holder', 'Holder', {
                render: (r) =>
                  r.assignment ? (
                    <>
                      <p className="text-sm text-ink">
                        {r.assignment.member.firstName} {r.assignment.member.lastName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {r.assignment.member.memberNumber}
                      </p>
                    </>
                  ) : (
                    <Badge tone="bg-amber-100 text-amber-900 ring-amber-200">Vacant</Badge>
                  ),
              }),
              col('term', 'Term', {
                render: (r) =>
                  r.assignment ? (
                    <span className="whitespace-nowrap text-xs text-ink-soft">
                      {formatDate(r.assignment.termStart)}
                      {r.assignment.termEnd
                        ? ` \u2013 ${formatDate(r.assignment.termEnd)}`
                        : ' \u2013 present'}
                    </span>
                  ) : (
                    '\u2014'
                  ),
              }),
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}

function MeetingsPanel({ rows }) {
  return (
    <Card>
      <CardHeader title="Upcoming meetings" />
      <CardBody className="p-2">
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No meetings scheduled" />
        ) : (
          rows.map((meeting) => (
            <a
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{meeting.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {formatDate(meeting.meetingDate)}
                  {meeting.venue ? ` \u00b7 ${meeting.venue}` : ''}
                </p>
              </div>
            </a>
          ))
        )}
      </CardBody>
    </Card>
  );
}