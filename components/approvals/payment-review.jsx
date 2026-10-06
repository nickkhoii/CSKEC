'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { reviewPaymentAction } from '@/actions/finance-actions';

/**
 * Approve / Reject controls for one pending payment submission.
 *
 * Approving posts the money: the server creates the Payment and exactly one
 * ledger entry, then recalculates the obligation balance. That is why the button
 * says so plainly - it is an irreversible posting, not a status tweak.
 */
export function PaymentReviewButtons({ submissionId, disabled, disabledReason, balance }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(null);
  const [remarks, setRemarks] = useState('');

  const decide = (decision) => {
    const formData = new FormData();
    formData.set('submissionId', submissionId);
    formData.set('decision', decision);
    if (remarks.trim()) formData.set('remarks', remarks.trim());

    startTransition(async () => {
      const result = await reviewPaymentAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      setMode(null);
      setRemarks('');
      router.refresh();
    });
  };

  if (disabled) {
    return (
      <span className="text-[11px] text-ink-muted" title={disabledReason}>
        {disabledReason ?? 'Not permitted'}
      </span>
    );
  }

  if (!mode) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="success" loading={pending} onClick={() => decide('APPROVE')}>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMode('reject')}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Reject
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        autoFocus
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        placeholder="Reviewer remarks"
        maxLength={1000}
        className="h-8 w-60 rounded-md border border-slate-300 px-2 text-xs focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant={mode === 'approve' ? 'success' : 'danger'}
          loading={pending}
          onClick={() => decide(mode === 'approve' ? 'APPROVE' : 'REJECT')}
        >
          Confirm {mode === 'approve' ? 'post' : 'reject'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Opens the uploaded proof-of-payment in a new tab. */
export function ProofLink({ attachments }) {
  if (!attachments || attachments.length === 0) {
    return <span className="text-[11px] text-ink-muted">No proof attached</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-800 hover:underline"
        >
          {file.mimeType?.startsWith('image/') ? 'View image' : 'View document'}
        </a>
      ))}
    </div>
  );
}
