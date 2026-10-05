import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Megaphone,
  Receipt,
  Wallet,
} from 'lucide-react';
import { requireCurrentMember, requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { memberAttendanceSummary } from '@/lib/attendance';
import { memberFinancialSummary } from '@/lib/finance';
import { formatPeso, moneyToNumber, paidPercentage } from '@/lib/money';
import { formatDate, formatDateTime, formatRelative, truncate } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { StatCard, ListRow } from '@/components/dashboard/cards';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatusBadge } from '@/components/ui';
import {
  ATTENDANCE_REQUEST_STATUS_BADGE,
  ATTENDANCE_REQUEST_STATUS_LABELS,
  OBLIGATION_TYPE_LABELS,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABELS,
  POST_CATEGORY_BADGE,
  POST_CATEGORY_SHORT,
} from '@/lib/constants';

export const metadata = { title: 'My Dashboard' };
export const dynamic = 'force-dynamic';

export default async function MemberDashboardPage() {
  const user = await requireUser();
  const member = await requireCurrentMember();
  const now = new Date();

  const [attendance, finances, latestUpdates, upcomingMeetings, upcomingActivities, pendingRequests] =
    await Promise.all([
      memberAttendanceSummary(member.id),
      memberFinancialSummary(member.id),
      prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        take: 5,
        select: { id: true, title: true, category: true, publishedAt: true, excerpt: true, isPinned: true },
      }),
      prisma.meeting.findMany({
        where: { status: 'SCHEDULED', meetingDate: { gte: now } },
        orderBy: { meetingDate: 'asc' },
        take: 4,
        select: { id: true, title: true, meetingDate: true, startTime: true, venue: true },
      }),
      prisma.activity.findMany({
        where: { status: 'PUBLISHED', requiresAttendance: true, endsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        take: 4,
        select: { id: true, title: true, startsAt: true, venue: true },
      }),
      prisma.attendanceRequest.findMany({
        where: { memberId: member.id, status: 'PENDING' },
        orderBy: { submittedAt: 'desc' },
        take: 3,
        select: { id: true, submittedAt: true, activity: { select: { title: true } } },
      }),
    ]);

  const { totals } = finances;
  const openObligations = [...finances.dues, ...finances.communityService, ...finances.otherFees]
    .filter((row) => row.status !== 'PAID' && row.status !== 'WAIVED')
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${member.firstName}`}
        description="Your club updates, attendance status and financial standing at a glance."
      />

      {user.mustChangePassword ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Password change required.</span> You are signed in with a
          temporary password.{' '}
          <Link href="/settings" className="font-medium underline">
            Set a new password now
          </Link>
          .
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance Rate"
          value={`${attendance.attendanceRate}%`}
          hint={`${attendance.presentRecords} of ${attendance.totalRecords} recorded activities`}
          icon={CalendarCheck}
          tone="navy"
          href="/attendance"
          footer={
            attendance.pendingRequests > 0 ? (
              <span className="text-amber-700">
                {attendance.pendingRequests} awaiting verification
              </span>
            ) : (
              <span className="text-ink-muted">{attendance.totalHours} service hours</span>
            )
          }
        />
        <StatCard
          label="Outstanding Balance"
          value={formatPeso(totals.outstanding)}
          hint={
            totals.overdueCount > 0
              ? `${totals.overdueCount} overdue obligation${totals.overdueCount === 1 ? '' : 's'}`
              : 'Nothing overdue'
          }
          icon={Wallet}
          tone={moneyToNumber(totals.overdue) > 0 ? 'red' : 'green'}
          href="/payments"
        />
        <StatCard
          label="Upcoming Activities"
          value={upcomingActivities.length}
          hint="Events open for attendance"
          icon={CalendarClock}
          tone="gold"
          href="/attendance"
        />
        <StatCard
          label="Latest Announcement"
          value={latestUpdates[0] ? formatRelative(latestUpdates[0].publishedAt) : '\u2014'}
          hint={latestUpdates[0] ? truncate(latestUpdates[0].title, 46) : 'No announcements yet'}
          icon={Megaphone}
          tone="slate"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Club Updates"
            description="Announcements, news, GMM and community service information"
            action={
              <Link href="/updates" className="text-xs font-medium text-navy-700 hover:underline">
                View all
              </Link>
            }
          />
          <CardBody className="p-0">
            {latestUpdates.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No updates yet"
                description="Published club updates will appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {latestUpdates.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/updates/${post.id}`}
                      className="block px-5 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={POST_CATEGORY_BADGE[post.category]}>
                          {POST_CATEGORY_SHORT[post.category]}
                        </Badge>
                        {post.isPinned ? (
                          <Badge tone="bg-gold-100 text-gold-800 ring-gold-200">Pinned</Badge>
                        ) : null}
                        <span className="text-[11px] text-ink-muted">
                          {formatRelative(post.publishedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink">{post.title}</p>
                      {post.excerpt ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{post.excerpt}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Upcoming Meetings" />
            <CardBody className="p-2">
              {upcomingMeetings.length === 0 ? (
                <EmptyState title="No meetings scheduled" />
              ) : (
                upcomingMeetings.map((meeting) => (
                  <ListRow
                    key={meeting.id}
                    href={`/meetings/${meeting.id}`}
                    title={meeting.title}
                    meta={`${formatDate(meeting.meetingDate)} \u00b7 ${meeting.startTime}${
                      meeting.venue ? ` \u00b7 ${meeting.venue}` : ''
                    }`}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Upcoming Activities" />
            <CardBody className="p-2">
              {upcomingActivities.length === 0 ? (
                <EmptyState title="No activities scheduled" />
              ) : (
                upcomingActivities.map((activity) => (
                  <ListRow
                    key={activity.id}
                    href={`/attendance?activity=${activity.id}`}
                    title={activity.title}
                    meta={formatDateTime(activity.startsAt)}
                  />
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
          <CardHeader
            title="Dues &amp; Community Service Status"
            action={
              <Link href="/payments" className="text-xs font-medium text-navy-700 hover:underline">
                Manage payments
              </Link>
            }
          />
          <CardBody className="p-0">
            {openObligations.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="You are fully paid up"
                description="No outstanding dues or community service contributions."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {openObligations.map((row) => {
                  const percent = paidPercentage(row.amountDue, row.amountPaid);
                  return (
                    <li key={row.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {OBLIGATION_TYPE_LABELS[row.type]} &middot; due {formatDate(row.dueDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold tabular-nums text-ink">
                            {formatPeso(row.balance)}
                          </span>
                          <StatusBadge
                            value={row.status}
                            labels={PAYMENT_STATUS_LABELS}
                            tones={PAYMENT_STATUS_BADGE}
                          />
                        </div>
                      </div>
                      <ProgressBar
                        className="mt-2"
                        value={percent}
                        label={`${percent}% paid`}
                        tone={percent >= 100 ? 'bg-emerald-500' : 'bg-navy-600'}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-200 text-center">
            <div className="px-3 py-3">
              <p className="text-[11px] text-ink-muted">Total Billed</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                {formatPeso(totals.billed)}
              </p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] text-ink-muted">Total Paid</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700">
                {formatPeso(totals.paid)}
              </p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] text-ink-muted">Outstanding</p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  moneyToNumber(totals.outstanding) > 0 ? 'text-rose-700' : 'text-ink'
                }`}
              >
                {formatPeso(totals.outstanding)}
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Pending Requests" />
            <CardBody className="p-2">
              {pendingRequests.length === 0 ? (
                <EmptyState
                  title="Nothing pending"
                  description="Submitted attendance and payments awaiting verification appear here."
                />
              ) : (
                pendingRequests.map((request) => (
                  <ListRow
                    key={request.id}
                    title={request.activity.title}
                    meta={`Submitted ${formatRelative(request.submittedAt)}`}
                    badge={
                      <StatusBadge
                        value="PENDING"
                        labels={ATTENDANCE_REQUEST_STATUS_LABELS}
                        tones={ATTENDANCE_REQUEST_STATUS_BADGE}
                      />
                    }
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent Transactions"
              action={
                <Link href="/payments" className="text-xs font-medium text-navy-700 hover:underline">
                  View all
                </Link>
              }
            />
            <CardBody className="p-2">
              {finances.payments.length === 0 ? (
                <EmptyState title="No payments recorded yet" />
              ) : (
                finances.payments.slice(0, 5).map((payment) => (
                  <ListRow
                    key={payment.id}
                    title={payment.obligation?.title ?? 'Member payment'}
                    meta={`${payment.paymentNumber} \u00b7 ${formatDate(payment.paymentDate)}`}
                    badge={
                      <span className="text-xs font-semibold tabular-nums text-emerald-700">
                        {formatPeso(payment.amount)}
                      </span>
                    }
                  />
                ))
              )}
            </CardBody>
          </Card>

          {moneyToNumber(totals.overdue) > 0 ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {totals.overdueCount} overdue obligation{totals.overdueCount === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs">
                {formatPeso(totals.overdue)} is past due. Submit a payment to clear your balance.
              </p>
              <Link href="/payments" className="mt-2 inline-block text-xs font-medium underline">
                Pay now
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}