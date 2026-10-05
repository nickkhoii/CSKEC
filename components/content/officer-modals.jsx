'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import { useToast } from '@/components/ui/toast';
import { toDateInputValue } from '@/lib/utils';
import { appointOfficerAction, endOfficerTermAction } from '@/actions/content-actions';

/**
 * ---------------------------------------------------------------------------
 * Officer assignment modals (shared by the Secretary and President modules)
 *
 * Officer records are append-only: appointing a successor ends the incumbent's
 * term but never deletes the historical row (see lib/officers.js).
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

export function AppointOfficerModal({ positions = [], members = [] }) {
  const [state, formAction] = useActionState(appointOfficerAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Appoint officer
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Appoint an officer"
        description="Appointing someone to an occupied office ends the incumbent's term; the historical record is kept."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <Field label="Office" required>
            <Select name="positionId" required defaultValue="">
              <option value="">Select an office…</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                  {position.code ? ` (${position.code})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Member" required hint="Only active members can hold office.">
            <Select name="memberId" required defaultValue="">
              <option value="">Select a member…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.memberNumber}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Term start" required>
              <Input
                name="termStart"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Term end" hint="Leave blank for an open-ended term.">
              <Input name="termEnd" type="date" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea name="notes" rows={2} maxLength={1000} />
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Save appointment
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Ends a current term. The row is retained with status ENDED, so the club's
 * officer history stays complete and printable.
 */
export function EndTermButton({ assignment }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (
      !window.confirm(
        `End ${assignment.member?.name ?? 'this member'}'s term in ${
          assignment.position?.name ?? 'this office'
        }? The historical record is retained.`,
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set('assignmentId', assignment.id);
    formData.set('termEnd', toDateInputValue(new Date()));

    startTransition(async () => {
      const result = await endOfficerTermAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={run}>
      End term
    </Button>
  );
}