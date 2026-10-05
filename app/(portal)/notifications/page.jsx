import { Bell } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { notifications } from '@/lib/notifications';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui';
import { MarkAllReadButton, MarkReadButton } from '@/components/notifications/controls';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/** Visual grouping so the feed is scannable without reading every row. */
const TYPE_TONES = {
  ATTENDANCE_SUBMITTED: 'bg-navy-100 text-navy-800 ring-navy-200',
  ATTENDANCE_APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ATTENDANCE_REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  PAYMENT_SUBMITTED: 'bg-navy-100 text-navy-800 ring-navy-200',
  PAYMENT_APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  PAYMENT_REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  PAYMENT_OVERDUE: 'bg-amber-100 text-amber-900 ring-amber-200',
  ANNOUNCEMENT_PUBLISHED: 'bg-gold-100 text-gold-800 ring-gold-200',
  NOTICE_PUBLISHED: 'bg-gold-100 text-gold-800 ring-gold-200',
  EVENT_SCHEDULED: 'bg-teal-100 text-teal-800 ring-teal-200',
  ACCOUNT_STATUS: 'bg-purple-100 text-purple-800 ring-purple-200',
  SYSTEM: 'bg-slate-100 text-slate-700 ring-slate-200',
};

function label(type) {
  return String(type)
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export default async function NotificationsPage() {
  const user = await requireUser();

  const [items, unreadCount] = await Promise.all([
    notifications.list(user.id, { take: 100 }),
    notifications.unreadCount(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Alerts about attendance, payments, publications and account changes."
        actions={unreadCount > 0 ? <MarkAllReadButton /> : null}
      />

      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="You will be notified here when attendance or payments need your attention."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={item.readAt ? 'px-5 py-3.5' : 'bg-navy-50/40 px-5 py-3.5'}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TYPE_TONES[item.type] ?? TYPE_TONES.SYSTEM}>
                          {label(item.type)}
                        </Badge>
                        {!item.readAt ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-navy-700">
                            New
                          </span>
                        ) : null}
                        <span className="text-[11px] text-ink-muted">
                          {formatRelative(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink">{item.title}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{item.message}</p>
                      {item.link ? (
                        <a
                          href={item.link}
                          className="mt-1.5 inline-block text-[11px] font-medium text-navy-700 hover:underline"
                        >
                          Open related record
                        </a>
                      ) : null}
                      <p className="mt-1 text-[10px] text-ink-muted">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                    {!item.readAt ? <MarkReadButton id={item.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {unreadCount > 0 ? (
        <p className="text-[11px] text-ink-muted">
          {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  );
}