'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, UserCog } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import { useToast } from '@/components/ui/toast';
import { toDateInputValue } from '@/lib/utils';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS } from '@/lib/constants';
import { updateMemberAction, setMemberStatusAction } from '@/actions/member-actions';

/**
 * ---------------------------------------------------------------------------
 * Member edit + membership-status controls (Secretary module).
 *
 * Status is a separate control from the edit form on purpose: membership status
 * is a register decision and deserves its own deliberate action rather than
 * riding along with an unrelated field edit.
 * ---------------------------------------------------------------------------
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

export function EditMemberModal({ member }) {
  const [state, formAction] = useActionState(updateMemberAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Edit member record"
        description={`${member.memberNumber} \u2014 changes are recorded in the audit log.`}
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />
          <input type="hidden" name="id" value={member.id} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="First name" required>
              <Input name="firstName" required maxLength={80} defaultValue={member.firstName} />
            </Field>
            <Field label="Middle name">
              <Input name="middleName" maxLength={80} defaultValue={member.middleName ?? ''} />
            </Field>
            <Field label="Last name" required>
              <Input name="lastName" required maxLength={80} defaultValue={member.lastName} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Suffix">
              <Input name="suffix" maxLength={10} defaultValue={member.suffix ?? ''} />
            </Field>
            <Field label="Email address" required>
              <Input name="email" type="email" required maxLength={254} defaultValue={member.email} />
            </Field>
            <Field label="Contact number">
              <Input name="contactNumber" maxLength={30} defaultValue={member.contactNumber ?? ''} />
            </Field>
            <Field label="Blood type">
              <Input name="bloodType" maxLength={5} defaultValue={member.bloodType ?? ''} />
            </Field>
            <Field label="Date joined" required>
              <Input
                name="dateJoined"
                type="date"
                required
                defaultValue={toDateInputValue(member.dateJoined)}
              />
            </Field>
            <Field label="Birthday">
              <Input name="birthday" type="date" defaultValue={toDateInputValue(member.birthday)} />
            </Field>
          </div>

          <Field label="Address">
            <Input name="address" maxLength={300} defaultValue={member.address ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency contact">
              <Input name="emergencyName" maxLength={120} defaultValue={member.emergencyName ?? ''} />
            </Field>
            <Field label="Emergency number">
              <Input name="emergencyPhone" maxLength={30} defaultValue={member.emergencyPhone ?? ''} />
            </Field>
          </div>

          <Field label="Membership status" required>
            <Select name="status" defaultValue={member.status}>
              {MEMBERSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEMBERSHIP_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea name="notes" rows={2} maxLength={2000} defaultValue={member.notes ?? ''} />
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
const NEXT_STATUS = {
  ACTIVE: 'INACTIVE',
  INACTIVE: 'ACTIVE',
  EXPUNGED: 'ACTIVE',
};

export function MemberStatusButton({ member }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const next = NEXT_STATUS[member.status];
  if (!next) return null;

  const run = () => {
    if (
      next !== 'ACTIVE' &&
      !window.confirm(
        `Set ${member.memberNumber}'s membership status to ${
          MEMBERSHIP_STATUS_LABELS[next]
        }? This is recorded in the audit log.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setMemberStatusAction(member.id, next);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  return (
    <Button
      size="sm"
      variant={next === 'ACTIVE' ? 'success' : 'secondary'}
      loading={pending}
      onClick={run}
    >
      <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
      Mark {MEMBERSHIP_STATUS_LABELS[next].toLowerCase()}
    </Button>
  );
}
