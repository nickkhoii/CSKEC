'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { reviewAttendanceAction } from '@/actions/attendance-actions';

/**
 * Approve / Reject controls for one pending attendance request.
 *
 * Both decisions call the same server action; the server decides whether the
 * reviewer is allowed to act and refuses self-review inside the transaction, so
 * this component never has to duplicate those rules - it only disables the
 * button and shows the reason.
 */
export function AttendanceReviewButtons({ requestId, disabled, disabledReason }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | null
  const [remarks, setRemarks] = useState('');

  const decide = (decision) => {
    const formData = new FormData();
    formData.set('requestId', requestId);
    formData.set('decision', decision);
    formData.set('recordStatus', 'PRESENT');
    if (remarks.trim()) formData.set('remarks', remarks.trim());

    startTransition(async () => {
      const result = await reviewAttendanceAction(formData);
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
        placeholder="Reason for rejection (shown to the member)"
        maxLength={1000}
        className="h-8 w-64 rounded-md border border-slate-300 px-2 text-xs focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
      />
      <div className="flex gap-1.5">
        <Button size="sm" variant="danger" loading={pending} onClick={() => decide('REJECT')}>
          Confirm reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Checkbox used by the bulk manual roll-call form. */
export function MemberCheckbox({ name, value, checked, disabled, label, sublabel }) {
  return (
    <label
      className={[
        'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-ink-muted'
          : 'cursor-pointer border-slate-200 hover:border-navy-300 has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50',
      ].join(' ')}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-navy-700 focus:ring-navy-400"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{label}</span>
        {sublabel ? <span className="block text-[10px] text-ink-muted">{sublabel}</span> : null}
      </span>
    </label>
  );
}
