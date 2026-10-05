'use client';

import { useActionState } from 'react';
import { Save, UserCog } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  ROLE_LIST,
  ROLE_LABELS,
} from '@/lib/constants';
import { updateUserAction } from '@/actions/admin-actions';

/**
 * Edit-account modal (System Administrator module).
 *
 * The server refuses to let an administrator demote or deactivate themselves
 * and refuses to remove the last active System Administrator, so the UI only
 * needs to surface the rules - it cannot bypass them.
 */
function Field({ label, required, hint, children }) {
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

export function EditUserModal({ user, members = [], isSelf }) {
  const [state, formAction] = useActionState(updateUserAction, null);
  const { isOpen, open, close } = useDisclosure();

  if (isSelf) return null;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>
        <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Button>
      <Modal open={isOpen} onClose={close} title="Edit account" description={user.email} size="lg">
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <input type="hidden" name="id" value={user.id} />

          <Field label="Full name" required>
            <Input name="fullName" required maxLength={120} defaultValue={user.fullName} />
          </Field>

          <Field label="Email address" required>
            <Input name="email" type="email" required maxLength={254} defaultValue={user.email} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Role"
              required
              hint="Changing the role revokes every active session immediately."
            >
              <Select name="role" defaultValue={user.role.key}>
                {ROLE_LIST.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Account status" required>
              <Select name="status" defaultValue={user.status}>
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ACCOUNT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Linked member record" hint="Optional. One member record per account.">
            <Select name="memberId" defaultValue={user.member?.id ?? ''}>
              <option value="">Not linked</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.memberNumber}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save account
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}