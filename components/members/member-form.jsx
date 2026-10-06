'use client';

import { useActionState, useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { createMemberAction } from '@/actions/member-actions';
import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_LABELS,
  ROLE_LIST,
  ROLE_LABELS,
} from '@/lib/constants';
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <UserPlus className="h-4 w-4" aria-hidden="true" />
      Create member
    </Button>
  );
}

/**
 * Member encoding form.
 *
 * Leaving the member number blank auto-generates the next ID from the
 * configurable format (CSEC-YYYY-NNNN). Creating the member and their portal
 * account happens in one transaction, so a half-created pair is impossible.
 */
export function MemberForm({ suggestedNumber }) {
  const [state, formAction] = useActionState(createMemberAction, null);
  const [createAccount, setCreateAccount] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      router.refresh();
    }
  }, [state, toast, router]);

  return (
    <form action={formAction} className="space-y-5">
      <ActionFeedback state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <Input name="firstName" required maxLength={80} />
        </Field>
        <Field label="Middle name">
          <Input name="middleName" maxLength={80} />
        </Field>
        <Field label="Last name" required>
          <Input name="lastName" required maxLength={80} />
        </Field>
        <Field label="Suffix">
          <Input name="suffix" maxLength={10} />
        </Field>
        <Field label="Email address" required>
          <Input name="email" type="email" required maxLength={254} />
        </Field>
        <Field label="Contact number">
          <Input name="contactNumber" maxLength={30} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Member ID" hint="Blank = auto-generate">
          <Input name="memberNumber" placeholder={suggestedNumber ?? ''} maxLength={40} />
        </Field>
        <Field label="Date joined" required>
          <Input
            name="dateJoined"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Birthday">
          <Input name="birthday" type="date" />
        </Field>
        <Field label="Membership status" required>
          <Select name="status" defaultValue="ACTIVE">
            {MEMBERSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MEMBERSHIP_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Blood type">
          <Input name="bloodType" maxLength={5} />
        </Field>
        <Field label="Address">
          <Input name="address" maxLength={300} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emergency contact">
          <Input name="emergencyName" maxLength={120} />
        </Field>
        <Field label="Emergency number">
          <Input name="emergencyPhone" maxLength={30} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" rows={2} maxLength={2000} />
      </Field>

      <AccountToggle checked={createAccount} onChange={setCreateAccount} />

      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <SubmitButton />
        <Button type="reset" variant="ghost">
          Clear
        </Button>
      </div>
    </form>
  );
}

function AccountToggle({ checked, onChange }) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="createAccount"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
        />
        <span>
          <span className="font-medium text-ink">Create a portal account</span>
          <span className="block text-[11px] text-ink-muted">
            The member signs in with this email and must change the password at first login.
          </span>
        </span>
      </label>

      {checked ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Portal role" required>
            <Select name="role" defaultValue="MEMBER">
              {ROLE_LIST.filter((r) => r === 'MEMBER').map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Initial password" required hint="10+ chars: upper, lower, number, symbol.">
            <Input
              name="accountPassword"
              type="password"
              minLength={10}
              autoComplete="new-password"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** Modal wrapper so the list page stays uncluttered. */
export function MemberFormModal({ suggestedNumber }) {
  const { isOpen, open, close } = useDisclosure();
  return (
    <>
      <Button onClick={open}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Encode new member
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Encode new member"
        description="Member IDs are unique. Leave blank to generate the next number automatically."
        size="lg"
      >
        <MemberForm suggestedNumber={suggestedNumber} />
      </Modal>
    </>
  );
}
