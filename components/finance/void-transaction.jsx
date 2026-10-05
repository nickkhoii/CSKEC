'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { voidTransactionAction } from '@/actions/finance-actions';

/**
 * Voids a ledger entry.
 *
 * Financial history is never deleted: a void keeps the row, its amount and the
 * reason, and excludes it from income/expense totals. The reason is mandatory
 * and is written to the audit log.
 */
export function VoidTransactionButton({ transactionId, disabled, disabledReason }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return (
      <span className="text-[11px] text-ink-muted" title={disabledReason}>
        {disabledReason ?? 'Not permitted'}
      </span>
    );
  }

  const handleClick = () => {
    const answer = window.prompt(
      'Reason for voiding this transaction (required and recorded in the audit log):',
      '',
    );
    if (answer === null) return;

    const reason = answer.trim();
    if (reason.length < 5) {
      toast.error('Please provide a reason of at least 5 characters.');
      return;
    }

    const formData = new FormData();
    formData.set('transactionId', transactionId);
    formData.set('reason', reason);
    startTransition(async () => {
      const result = await voidTransactionAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  return (
    <Button
      size="sm"
      variant="danger"
      loading={pending}
      onClick={handleClick}
      disabled={pending}
    >
      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
      Void
    </Button>
  );
}