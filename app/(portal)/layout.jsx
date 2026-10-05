import { requireUser } from '@/lib/session';
import { notifications } from '@/lib/notifications';
import { AppShellFrame } from '@/components/layout/navbar';

/**
 * Portal shell for every signed-in page.
 *
 * `requireUser()` is the authoritative gate: it redirects to /login without a
 * session and blocks non-ACTIVE accounts. The sidebar is handed the user's
 * permission list so the navigation can never offer a page the user cannot open.
 *
 * Only serialisable data may be passed to <AppShellFrame> (a Client Component):
 * a plain user object, an array of permission strings and notification rows.
 * Passing a render-prop function across the RSC boundary throws at render time.
 */
export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }) {
  const user = await requireUser();

  const [unreadCount, recentNotifications] = await Promise.all([
    notifications.unreadCount(user.id),
    notifications.list(user.id, { take: 6 }),
  ]);

  return (
    <AppShellFrame
      user={user}
      permissions={user.permissions ?? []}
      unreadCount={unreadCount}
      notifications={recentNotifications}
    >
      {children}
    </AppShellFrame>
  );
}