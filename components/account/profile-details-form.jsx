'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Textarea } from '@/components/ui/form';
import { updateProfileAction } from '@/actions/auth-actions';
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
      <Save className="h-4 w-4" aria-hidden="true" />
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

/** Lets a member maintain their own contact and emergency details. */
export function ProfileDetailsForm({ member }) {
  const [state, formAction] = useActionState(updateProfileAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <ActionFeedback state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact number">
          <Input
            name="contactNumber"
            defaultValue={member?.contactNumber ?? ''}
            maxLength={30}
            placeholder="+63 917 000 0000"
          />
        </Field>
        <Field label="Birthday">
          <Input
            name="birthday"
            type="date"
            defaultValue={member?.birthday ? member.birthday.toISOString().slice(0, 10) : ''}
          />
        </Field>
        <Field label="Emergency contact">
          <Input name="emergencyName" defaultValue={member?.emergencyName ?? ''} maxLength={120} />
        </Field>
        <Field label="Emergency number">
          <Input name="emergencyPhone" defaultValue={member?.emergencyPhone ?? ''} maxLength={30} />
        </Field>
        <Field label="Blood type">
          <Input name="bloodType" defaultValue={member?.bloodType ?? ''} maxLength={5} />
        </Field>
      </div>

      <Field label="Address">
        <Textarea name="address" rows={2} defaultValue={member?.address ?? ''} maxLength={300} />
      </Field>

      <div className="border-t border-slate-200 pt-4">
        <Submit />
      </div>
    </form>
  );
}