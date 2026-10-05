'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { submitPaymentAction } from '@/actions/finance-actions';
import { PAYMENT_METHODS } from '@/lib/constants';

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200';

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
      {children} <span className="text-rose-600">*</span>
    </label>
  );
}

/**
 * Payment submission form.
 *
 * The amount defaults to the obligation's remaining balance but stays editable so
 * a member can make a PARTIAL payment - the ledger supports that, and the
 * obligation lands in PARTIALLY_PAID until the balance reaches zero.
 */
export function SubmitPaymentForm({ obligations }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [obligationId, setObligationId] = useState(obligations[0]?.id ?? '');

  const selected = obligations.find((row) => row.id === obligationId);
  const today = new Date().toISOString().slice(0, 10);

  const submit = (formData) =>
    new Promise((resolve) => {
      startTransition(async () => {
        const result = await submitPaymentAction(null, formData);
        if (result?.success) {
          toast.success(result.message);
          setOpen(false);
        } else if (result?.message) {
          toast.error(result.message);
        }
        router.refresh();
        resolve(result);
      });
    });

  if (obligations.length === 0) {
    return (
      <p className="text-sm text-ink-muted">You have no outstanding obligations to pay right now.</p>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        Submit a payment
      </Button>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="obligationId">Paying which obligation?</Label>
          <select
            id="obligationId"
            name="obligationId"
            value={obligationId}
            onChange={(event) => setObligationId(event.target.value)}
            required
            className={field}
          >
            {obligations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title} &mdash; balance {row.balanceText}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-ink">Payment type</span>
          <input type="hidden" name="type" value={selected?.type ?? 'MONTHLY_DUES'} />
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-soft">
            {selected?.typeLabel ?? '\u2014'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <input
            id="amount"
            name="amount"
            key={selected?.id ?? 'none'}
            defaultValue={selected?.balanceText ?? ''}
            inputMode="decimal"
            required
            className={`${field} tabular-nums`}
          />
          <p className="text-[11px] text-ink-muted">Edit down to make a partial payment.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paymentDate">Payment date</Label>
          <input
            id="paymentDate"
            name="paymentDate"
            type="date"
            defaultValue={today}
            max={today}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paymentMethod">Method</Label>
          <select id="paymentMethod" name="paymentMethod" required className={field}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="referenceNumber">Reference number</Label>
          <input
            id="referenceNumber"
            name="referenceNumber"
            required
            minLength={3}
            maxLength={80}
            placeholder="e.g. RCPT-0001 or a bank trace number"
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-ink">Proof of payment</span>
          <input
            id="proof"
            name="proof"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-navy-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-navy-800"
          />
          <p className="text-[11px] text-ink-muted">JPG, PNG, WEBP or PDF up to 5 MB.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-ink">Notes for the Treasurer</span>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} className={`${field} resize-y`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
        <Button type="submit" loading={pending}>
          Submit for verification
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
        <p className="text-[11px] text-ink-muted">
          Stays <strong>Pending Verification</strong> until the Treasurer approves it.
        </p>
      </div>
    </form>
  );
}