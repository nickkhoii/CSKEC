'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { createUserAction } from '@/actions/admin-actions';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, ROLE_LIST, ROLE_LABELS } from '@/lib/constants';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';

function Field({ label, required, children, hint }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      Create account
    </Button>
  );
}

/**
 * Creates a portal account.
 *
 * A member can be linked optionally; the server refuses to link one member to
 * two accounts and enforces the password policy.
 */
export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, null);
  const router = useRouter();
  const toast = useToast();

  if (state?.success) {
    toast.success(state.message);
    router.refresh();
  }

  return (
    <form action={formAction} className="space-y-4">
      <ActionFeedback state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input name="fullName" required maxLength={120} />
        </Field>
        <Field label="Email address" required>
          <Input name="email" type="email" required maxLength={254} />
        </Field>
        <Field label="Role" required>
          <Select name="role" defaultValue="MEMBER">
            {ROLE_LIST.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Account status" required>
          <Select name="status" defaultValue="ACTIVE">
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACCOUNT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Temporary password"
          required
          hint="10+ chars with upper case, lower case, a number and a symbol."
        >
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Linked member ID" hint="Optional. Format: CSEC-2024-0001">
          <Input name="memberId" maxLength={40} placeholder="CSEC-2024-0001" />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="mustChangePassword"
          defaultChecked
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
        />
        <span>
          <span className="font-medium text-ink">Force a password change at first sign-in</span>
          <span className="block text-[11px] text-ink-muted">
            Recommended for every account created by an administrator.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <Submit />
        <Button type="reset" variant="ghost">
          Clear
        </Button>
      </div>
    </form>
  );
}

export function CreateUserModal() {
  const { isOpen, open, close } = useDisclosure();
  return (
    <>
      <Button onClick={open}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Create account
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Create user account"
        description="Email addresses must be unique across the portal."
        size="lg"
      >
        <CreateUserForm />
      </Modal>
    </>
  );
}