import Link from 'next/link';
import { Building2, ShieldCheck, UserCog } from 'lucide-react';
import { requireUser, getCurrentMember } from '@/lib/session';
import {
  SETTING_KEYS,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
} from '@/lib/settings';
import { formatDate } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { ProfileDetailsForm } from '@/components/account/profile-details-form';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * ---------------------------------------------------------------------------
 * /settings — self-service settings for every signed-in user.
 *
 * This is the page the navbar's "Settings & Security" entry points at, so it
 * deliberately contains nothing role-gated: the member maintains their own
 * contact details here and reads the club rules that apply to them.
 * Role-specific configuration lives in /admin/settings.
 * ---------------------------------------------------------------------------
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const member = await getCurrentMember();

  const [sessionHours, lockMinutes, maxAttempts, allowSelfRecord, attendanceWindow] =
    await Promise.all([
      getSetting(SETTING_KEYS.SESSION_HOURS),
      getSetting(SETTING_KEYS.LOGIN_LOCKOUT_MINUTES),
      getSetting(SETTING_KEYS.LOGIN_MAX_ATTEMPTS),
      getSetting(SETTING_KEYS.ALLOW_SELF_RECORD),
      getSetting(SETTING_KEYS.ATTENDANCE_WINDOW_DAYS),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your contact details and the club rules that apply to your account."
      />

      {user.mustChangePassword ? (
        <Alert tone="warning" title="Password change required">
          You are signed in with a temporary password. Change it on your{' '}
          <Link href="/profile" className="font-medium underline">
            profile page
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MyDetailsCard member={member} />
        </div>

        <div className="space-y-6">
          <AccountCard user={user} member={member} />
          <RulesCard
            sessionHours={sessionHours}
            lockMinutes={lockMinutes}
            maxAttempts={maxAttempts}
            allowSelfRecord={allowSelfRecord}
            attendanceWindow={attendanceWindow}
          />
        </div>
      </div>
    </div>
  );
}

function MyDetailsCard({ member }) {
  return (
    <Card>
      <CardHeader
        title="My details"
        description="Name, email and membership status are maintained by the club Secretary."
        action={<Badge tone="bg-navy-100 text-navy-800 ring-navy-200">Read-only fields</Badge>}
      />
      <CardBody>
        {!member ? (
          <Alert tone="warning" title="No member record linked">
            Your account is not linked to a member record, so there are no details to maintain
            here. Please contact the club Secretary.
          </Alert>
        ) : (
          <div className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Full name</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {[member.firstName, member.middleName, member.lastName]
                    .filter(Boolean)
                    .join(' ')}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Member ID</dt>
                <dd className="mt-0.5 font-mono text-sm text-ink">{member.memberNumber}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Email</dt>
                <dd className="mt-0.5 text-sm text-ink">{member.email}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">Joined</dt>
                <dd className="mt-0.5 text-sm text-ink">{formatDate(member.dateJoined)}</dd>
              </div>
            </dl>

            <div className="border-t border-slate-200 pt-4">
              <ProfileDetailsForm member={member} />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function AccountCard({ user, member }) {
  return (
    <Card>
      <CardHeader title="My account" />
      <CardBody>
        <dl className="space-y-2 text-sm">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={ROLE_LABELS[user.role] ?? user.role} />
          <Row label="Status" value={user.status} />
          <Row label="Member record" value={member ? member.memberNumber : 'Not linked'} />
        </dl>
        <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-ink-muted">
          To change your name, email or password, use the{' '}
          <Link href="/profile" className="font-medium text-navy-700 hover:underline">
            profile page
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}

function RulesCard({ sessionHours, lockMinutes, maxAttempts, allowSelfRecord, attendanceWindow }) {
  return (
    <Card>
      <CardHeader title="Club rules that affect you" />
      <CardBody className="space-y-3">
        <Rule
          icon={Building2}
          label="Attendance window"
          value={`${attendanceWindow ?? 7} day(s) after an event`}
        />
        <Rule
          icon={ShieldCheck}
          label="Session lifetime"
          value={`${getNumberSetting(sessionHours, 8)} hour(s)`}
        />
        <Rule
          icon={UserCog}
          label="Lockout policy"
          value={`${maxAttempts ?? 5} failed sign-ins lock the account for ${getNumberSetting(
            lockMinutes,
            15,
          )} minute(s)`}
        />
        <Rule
          icon={Building2}
          label="Manual self-recording"
          value={getBooleanSetting(allowSelfRecord) ? 'Allowed' : 'Not allowed'}
        />
      </CardBody>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

function Rule({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-slate-50 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="text-[11px] text-ink-muted">{value}</p>
      </div>
    </div>
  );
}