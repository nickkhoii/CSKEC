import { requireUser } from '@/lib/session';
import { roleCan } from '@/lib/rbac';
import { notifications } from '@/lib/notifications';
import { AppShellFrame } from '@/components/layout/navbar';
import { Sidebar } from '@/components/layout/sidebar';

/**
 * Portal shell for every signed-in page.
 *
 * `requireUser()` is the authoritative gate: it redirects to /login without a
 * session and blocks non-ACTIVE accounts. The `canFn` handed to the sidebar is
 * derived from the server-side permission matrix - the same one the server
 * actions enforce - so the navigation can never offer a page the user cannot open.
 */
export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }) {
  const user = await requireUser();

  const [unreadCount, recentNotifications] = await Promise.all([
    notifications.unreadCount(user.id),
    notifications.list(user.id, { take: 6 }),
  ]);

  const canFn = (permission) => roleCan(user.role, permission);

  const sidebar = ({ mobileOpen, onCloseMobile }) => (
    <Sidebar user={user} canFn={canFn} mobileOpen={mobileOpen} onCloseMobile={onCloseMobile} />
  );

  return (
    <AppShellFrame
      user={user}
      unreadCount={unreadCount}
      notifications={recentNotifications}
      sidebar={sidebar}
    >
      {children}
    </AppShellFrame>
  );
}