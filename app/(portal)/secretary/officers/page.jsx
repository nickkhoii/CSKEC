import { requirePermission, PERMISSIONS } from '@/lib/session';
import { OfficerRegister } from '@/components/content/officer-register';

export const metadata = { title: 'Club Officers' };
export const dynamic = 'force-dynamic';

export default async function SecretaryOfficersPage() {
  await requirePermission(PERMISSIONS.OFFICER_VIEW);

  return (
    <OfficerRegister
      title="Club Officers"
      description="Appoint officers and end terms. Appointing a successor ends the incumbent's term but always retains the historical row."
    />
  );
}