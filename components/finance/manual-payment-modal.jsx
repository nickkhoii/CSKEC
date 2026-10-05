'use client';

import { useActionState, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { manualPaymentAction } from '@/actions/finance-actions';

/**
 * ---------------------------------------------------------------------------
 * Manual payment recorder (Treasurer module)
 *
 * Used for cash or offline payments where the member cannot submit online. The
 * server posts the money through the same service the approve path uses, so a
 * manual payment updates the ledger and the obligation balance identically.
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

export function ManualPaymentModal({ members = [] }) {
  const [state, formAction] = useActionState(manualPaymentAction, null);
  const { isOpen, open, close } = useDisclosure();
  const [memberId, setMemberId] = useState('');

  // Obligations are filtered client-side for convenience; the server re-checks
  // that the obligation belongs to the chosen member.
  const selected = members.find((m) => m.id === memberId);
  const obligations = selected?.obligations ?? [];

  return (
    <>
      <Button onClick={open} variant="secondary">
        <HandCoins className="h-4 w-4" aria-hidden="true" />
        Record manual payment
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Record a manual payment"
        description="For cash or offline payments received at the club. This posts directly to the ledger."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <Field label="Member" required>
            <Select name="memberId" required defaultValue="" onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.memberNumber}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Applied to obligation"
            hint="Optional for general donations, otherwise the obligation balance is reduced."
          >
            <Select name="obligationId" defaultValue="">
              <option value="">Not linked to an obligation</option>
              {obligations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} — balance {o.balanceText}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </Field>
            <Field label="Payment date" required>
              <Input name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Reference number" required hint="Receipt or transaction reference.">
              <Input name="referenceNumber" required minLength={3} maxLength={80} />
            </Field>
            <Field label="Payment method" required>
              <Select name="paymentMethod" defaultValue="CASH">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Remarks">
            <Textarea name="remarks" rows={2} maxLength={1000} />
          </Field>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Post payment</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}