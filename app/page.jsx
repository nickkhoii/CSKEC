import { redirect } from 'next/navigation';
import { dashboardPathForRole } from '@/lib/rbac';
import { getSessionUser } from '@/lib/session';

/** Root entry point: send visitors to their dashboard or to the login screen. */
export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user && user.status === 'ACTIVE' ? dashboardPathForRole(user.role) : '/login');
}