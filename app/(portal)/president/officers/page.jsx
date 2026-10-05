import { requirePermission, PERMISSIONS } from '@/lib/session';
import { OfficerRegister } from '@/components/content/officer-register';

export const metadata = { title: 'Officer Assignments' };
export const dynamic = 'force-dynamic';

export default async function PresidentOfficersPage() {
  await requirePermission(PERMISSIONS.OFFICER_MANAGE);

  return (
    <OfficerRegister
      title="Officer Assignments"
      description="Appoint club officers and close out terms. Officer history is append-only: a successor never erases a predecessor."
    />
  );
}