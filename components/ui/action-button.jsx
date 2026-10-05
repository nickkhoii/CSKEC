'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

/**
 * Single-button wrapper around a server action that takes plain arguments
 * rather than a form.
 *
 * Several portal actions follow the `(id, status)` signature, which does not fit
 * `useActionState`'s `(prevState, formData)` contract. This adapter keeps those
 * call sites to one line while preserving the shared toast + refresh behaviour.
 */
export function ActionButton({
  action,
  args = [],
  label,
  variant = 'secondary',
  size = 'sm',
  disabled,
  disabledReason,
  confirmMessage,
  icon: Icon,
}) {
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

  const run = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action(...args);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  return (
    <Button size={size} variant={variant} loading={pending} onClick={run}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}