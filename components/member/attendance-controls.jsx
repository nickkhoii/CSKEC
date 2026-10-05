'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { submitAttendanceAction, cancelAttendanceRequestAction } from '@/actions/attendance-actions';
import { ATTENDANCE_REQUEST_STATUS_LABELS } from '@/lib/constants';

/**
 * "PRESENT" button for one activity.
 *
 * Submitting only creates a *request* - the official attendance record is written
 * later by a Secretary. The button reflects the current state so a member can
 * never double-submit (the database enforces that too).
 */
export function PresentButton({ activityId, status, disabled, disabledReason, requestId }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showRemarks, setShowRemarks] = useState(false);
  const [remarks, setRemarks] = useState('');

  const run = (fn) =>
    new Promise((resolve) => {
      startTransition(async () => {
        const result = await fn();
        if (result?.success) toast.success(result.message);
        else if (result?.message) toast.error(result.message);
        router.refresh();
        resolve(result);
      });
    });

  const submit = (formData) => run(() => submitAttendanceAction(null, formData));
  const cancel = () => run(() => cancelAttendanceRequestAction(requestId));

  if (status === 'RECORDED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Recorded
      </span>
    );
  }

  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
          {ATTENDANCE_REQUEST_STATUS_LABELS.PENDING}
        </span>
        <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
          Withdraw
        </Button>
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
        Approved
      </span>
    );
  }

  const rejected = status === 'REJECTED';

  if (disabled) {
    return (
      <span className="text-[11px] text-ink-muted" title={disabledReason}>
        {disabledReason ?? 'Not available'}
      </span>
    );
  }

  if (!showRemarks) {
    return (
      <Button
        variant={rejected ? 'secondary' : 'primary'}
        size="sm"
        loading={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set('activityId', activityId);
          submit(formData);
        }}
      >
        <Send className="h-3.5 w-3.5" aria-hidden="true" />
        {rejected ? 'Re-submit' : 'Present'}
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set('activityId', activityId);
        submit(formData);
      }}
    >
      <Input
        name="remarks"
        placeholder="Optional note for the Secretary"
        maxLength={1000}
        className="h-8 w-48 text-xs"
      />
      <Button type="submit" size="sm" loading={pending}>
        Submit
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setShowRemarks(false)}>
        Cancel
      </Button>
    </form>
  );
}