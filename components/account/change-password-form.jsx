'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/form';
import { changePasswordAction } from '@/actions/auth-actions';
import { ActionFeedback } from '@/components/page';

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <KeyRound className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Updating…' : 'Change password'}
    </Button>
  );
}

/**
 * Password change.
 *
 * Changing the password bumps `tokenVersion`, which invalidates every other
 * session for this account - the user stays signed in here and is signed out
 * everywhere else.
 */
export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <ActionFeedback state={state} />

      <Field label="Current password">
        <Input name="currentPassword" type="password" required autoComplete="current-password" />
      </Field>
      <Field
        label="New password"
        hint="At least 10 characters with upper case, lower case, a number and a symbol."
      >
        <Input name="newPassword" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password">
        <Input name="confirmPassword" type="password" required autoComplete="new-password" />
      </Field>

      <div className="border-t border-slate-200 pt-4">
        <Submit />
      </div>
    </form>
  );
}