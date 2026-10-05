'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { loginAction } from '@/actions/auth-actions';
import { Button, Alert } from '@/components/ui';
import { InputField } from '@/components/ui/form';

/** Submit button that reflects the pending state of its parent <form>. */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" loading={pending}>
      <LogIn className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

const ERROR_MESSAGES = {
  CredentialsSignin: 'Incorrect email or password.',
  AccountInactive: 'This account is not active. Please contact the club System Administrator.',
  AccessDenied: 'You do not have permission to open that page.',
  Configuration: 'Sign-in is not configured correctly. Please contact the administrator.',
};

export function LoginForm({ callbackUrl }) {
  const [state, formAction] = useActionState(loginAction, null);
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const urlError = searchParams.get('error');
  const bannerMessage = state?.message ?? (urlError ? ERROR_MESSAGES[urlError] : null);
  const resolvedCallbackUrl = callbackUrl ?? searchParams.get('callbackUrl') ?? '';

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="callbackUrl" value={resolvedCallbackUrl} />

      {bannerMessage ? (
        <Alert tone={state?.message ? 'error' : 'warning'} title="Sign-in failed">
          {bannerMessage}
        </Alert>
      ) : null}

      <InputField
        label="Email address"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        placeholder="you@example.com"
        error={state?.fieldErrors?.email}
        hint="Use the email address registered by the club Secretary."
      />

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-ink">
          Password
          <span className="ml-0.5 text-rose-600">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-invalid={state?.fieldErrors?.password ? 'true' : undefined}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-ink placeholder:text-ink-muted focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {state?.fieldErrors?.password ? (
          <p className="text-[11px] font-medium text-rose-600" role="alert">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2.5 text-[11px] text-ink-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-500" aria-hidden="true" />
        <span>
          Your password is hashed with bcrypt and never stored in plain text. Sessions expire
          automatically, and repeated failed attempts temporarily lock the account.
        </span>
      </p>
    </form>
  );
}