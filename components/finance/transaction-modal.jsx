'use client';

import { useActionState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useDisclosure } from '@/components/ui/modal';
import { ActionFeedback } from '@/components/page';
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from '@/lib/constants';
import { createTransactionAction } from '@/actions/finance-actions';

/**
 * ---------------------------------------------------------------------------
 * Ledger entry form (Treasurer module).
 *
 * Used for money that is not a member payment: fundraising income, event
 * expenses, bank fees and so on. The server rejects future dates and non-positive
 * amounts, and assigns a sequential transaction number inside the transaction.
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

export function CreateTransactionModal({ categories = [], members = [] }) {
  const [state, formAction] = useActionState(createTransactionAction, null);
  const { isOpen, open, close } = useDisclosure();

  return (
    <>
      <Button onClick={open}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add ledger entry
      </Button>
      <Modal
        open={isOpen}
        onClose={close}
        title="Add a ledger entry"
        description="Record income or an expense that is not a member payment."
        size="lg"
      >
        <form action={formAction} className="space-y-5">
          <ActionFeedback state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" required>
              <Select name="type" defaultValue="INCOME">
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" required>
              <Select name="categoryId" required defaultValue="">
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </Field>
            <Field label="Transaction date" required>
              <Input
                name="transactionDate"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </div>

          <Field label="Description" required>
            <Input
              name="description"
              required
              minLength={3}
              maxLength={500}
              placeholder="Donation from the general assembly"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference" hint="Receipt or document number.">
              <Input name="reference" maxLength={100} />
            </Field>
            <Field label="Attributed to member" hint="Optional.">
              <Select name="memberId" defaultValue="">
                <option value="">Not member-specific</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.memberNumber}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
            <Button type="submit">Save entry</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}