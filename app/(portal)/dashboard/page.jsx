import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { dashboardPathForRole } from '@/lib/rbac';

/**
 * /dashboard is a router, not a page: it sends the signed-in user to the
 * dashboard for their role. The redirect is decided server-side from the role in
 * the session, so it cannot be influenced by a query parameter.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardRouterPage() {
  const user = await requireUser();
  redirect(dashboardPathForRole(user.role));
}