'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from '@/actions/auth-actions';

/** Marks a single notification as read (optimistic: refresh immediately). */
export function MarkReadButton({ id }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationsReadAction([id]);
          if (result?.success) toast.success(result.message);
          else if (result?.message) toast.error(result.message);
          router.refresh();
        })
      }
    >
      Mark read
    </Button>
  );
}

/** "Mark all read" control for the notifications page header. */
export function MarkAllReadButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (result?.success) toast.success(result.message);
          else if (result?.message) toast.error(result.message);
          router.refresh();
        })
      }
    >
      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Mark all read
    </Button>
  );
}