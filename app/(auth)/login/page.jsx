import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { dashboardPathForRole } from '@/lib/rbac';
import { SETTING_KEYS, getSetting } from '@/lib/settings';
import { LoginForm } from '@/components/auth/login-form';
import { ClubLogo } from '@/components/club-logo';

export const metadata = { title: 'Sign in' };
// Never prerender: the page reads the session and club settings at request time.
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const user = await getSessionUser();
  // Already signed in -> go straight to the role's dashboard.
  if (user && user.status === 'ACTIVE') {
    redirect(dashboardPathForRole(user.role));
  }

  const params = await searchParams;
  const callbackUrl = typeof params?.callbackUrl === 'string' ? params.callbackUrl : '';
  const clubName = await getSetting(SETTING_KEYS.CLUB_NAME, 'Centro Sugbo Eagles Club');

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel - hidden on small screens so the form owns the viewport. */}
      <div className="relative hidden flex-col justify-between bg-navy-900 p-10 text-navy-100 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #ecc86c 0, transparent 45%), radial-gradient(circle at 80% 70%, #94b8de 0, transparent 40%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <ClubLogo className="h-24 w-[72px] rounded-lg" priority />
            <div>
              <p className="text-base font-semibold text-white">{clubName}</p>
              <p className="text-xs uppercase tracking-[0.15em] text-gold-400">Members Portal</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md space-y-5">
          <h1 className="text-2xl font-semibold leading-snug text-white">
            One secure place for club records, attendance and finances.
          </h1>
          <ul className="space-y-2.5 text-sm text-navy-200">
            {[
              'Read club updates, notices and meeting minutes',
              'Submit attendance for verification by the Secretary',
              'Track monthly dues and submit payments for verification',
              'Download printable reports and CSV exports',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-navy-400">
          Internal system. Access is restricted to registered members and club officers.
        </p>
      </div>

      {/* Sign-in form */}
      <div className="flex items-center justify-center bg-white px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <ClubLogo className="h-20 w-[60px] rounded-lg" priority />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-ink">Sign in to your account</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Use the email address and password issued by the club Secretary.
          </p>

          <div className="mt-6">
            {/* useSearchParams needs a Suspense boundary during prerendering. */}
            <Suspense fallback={<div className="h-64" />}>
              <LoginForm callbackUrl={callbackUrl} />
            </Suspense>
          </div>

          <p className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-ink-muted">
            Having trouble signing in? Contact the club Secretary or the System Administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
