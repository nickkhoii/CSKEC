import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { requireUser, getCurrentMember } from '@/lib/session';
import { SETTING_KEYS, getSetting, getNumberSetting } from '@/lib/settings';
import { formatDate, formatDateTime } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import { PageHeader, DetailRow } from '@/components/page';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui';
import { ChangePasswordForm } from '@/components/account/change-password-form';

export const metadata = { title: 'Profile & Security' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  const member = await getCurrentMember();
  const sessionHours = getNumberSetting(await getSetting(SETTING_KEYS.SESSION_HOURS), 8);
  const lockMinutes = getNumberSetting(
    await getSetting(SETTING_KEYS.LOGIN_LOCKOUT_MINUTES),
    15,
  );
  const maxAttempts = getNumberSetting(await getSetting(SETTING_KEYS.LOGIN_MAX_ATTEMPTS), 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile &amp; Security"
        description="Your account details, club role and password settings."
      />

      {user.mustChangePassword ? (
        <Alert tone="warning" title="Password change required">
          You are signed in with a temporary password. Set a new one below to secure your
          account.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Name" value={user.name} />
              <DetailRow label="Email" value={user.email} />
              <DetailRow label="Role" value={ROLE_LABELS[user.role] ?? user.role} />
              <DetailRow label="Account status" value={user.status} />
              <DetailRow
                label="Member ID"
                value={member?.memberNumber ?? 'Not linked to a member record'}
              />
            </dl>
          </CardBody>
        </Card>

        {member ? (
          <Card>
            <CardHeader
              title="Member record"
              description="Contact details are maintained by the club Secretary."
            />
            <CardBody>
              <dl className="divide-y divide-slate-100">
                <DetailRow
                  label="Full name"
                  value={`${member.firstName} ${member.middleName ?? ''} ${member.lastName}`.trim()}
                />
                <DetailRow label="Membership status" value={member.status} />
                <DetailRow label="Date joined" value={formatDate(member.dateJoined)} />
                <DetailRow label="Contact number" value={member.contactNumber} />
                <DetailRow label="Address" value={member.address} />
                <DetailRow label="Emergency contact" value={member.emergencyName} />
                <DetailRow label="Emergency number" value={member.emergencyPhone} />
              </dl>
              <p className="mt-4 text-[11px] text-ink-muted">
                Name, email and membership status are edited by the Secretary. Contact details
                are editable from your{' '}
                <a href="/settings" className="font-medium text-navy-700 hover:underline">
                  settings page
                </a>
                .
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Member record" />
            <CardBody>
              <Alert tone="warning" title="No member record linked">
                Your account is not linked to a member record, so club updates, attendance and
                dues are unavailable. Please contact the club Secretary.
              </Alert>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Change password"
            description="Changing your password signs you out of every other device."
          />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Security policy" />
          <CardBody>
            <div className="flex items-start gap-2.5 rounded-md bg-slate-50 px-3 py-2.5 text-xs text-ink-soft">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden="true" />
              <ul className="space-y-1.5">
                <li>
                  Sessions expire automatically after{' '}
                  <strong>{sessionHours} hour(s)</strong>.
                </li>
                <li>
                  After <strong>{maxAttempts}</strong> failed sign-ins an account is locked for{' '}
                  <strong>{lockMinutes} minute(s)</strong>.
                </li>
                <li>
                  A password change or an administrative reset immediately signs the account
                  out everywhere else.
                </li>
                <li>Every sign-in is recorded in the audit log.</li>
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}