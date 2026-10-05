'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Unlock, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { resetUserPasswordAction, setUserStatusAction, unlockUserAction } from '@/actions/admin-actions';

/**
 * Account administration controls.
 *
 * Each button calls a server action that re-checks the permission and the
 * "last active administrator" invariant. The component only reflects the current
 * state; it never decides whether the action is allowed.
 */
export function UserAdminControls({ user, currentUserId }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const isSelf = user.id === currentUserId;

  const setStatus = (status) => {
    const formData = new FormData();
    formData.set('userId', user.id);
    formData.set('status', status);
    if (status === 'DEACTIVATED') {
      const reason = window.prompt('Reason for deactivating this account (optional):', '');
      if (reason === null) return;
      if (reason.trim()) formData.set('reason', reason.trim());
    }
    startTransition(async () => {
      const result = await setUserStatusAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  const unlock = () =>
    startTransition(async () => {
      const result = await unlockUserAction(user.id);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });

  const resetPassword = () => {
    const password = window.prompt(
      'New temporary password (at least 10 characters, with upper case, lower case, a number and a symbol). The user must change it at next sign-in:',
      '',
    );
    if (password === null) return;
    const formData = new FormData();
    formData.set('userId', user.id);
    formData.set('newPassword', password);
    startTransition(async () => {
      const result = await resetUserPasswordAction(formData);
      if (result?.success) toast.success(result.message);
      else if (result?.message) toast.error(result.message);
      router.refresh();
    });
  };

  if (isSelf) {
    return (
      <span className="text-[11px] text-ink-muted">This is your own account</span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {user.status !== 'ACTIVE' ? (
        <Button size="sm" variant="success" loading={pending} onClick={() => setStatus('ACTIVE')}>
          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Activate
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() => setStatus('INACTIVE')}
        >
          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
          Deactivate
        </Button>
      )}

      {user.status === 'ACTIVE' ? (
        <Button size="sm" variant="danger" loading={pending} onClick={() => setStatus('DEACTIVATED')}>
          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
          Suspend
        </Button>
      ) : null}

      <Button size="sm" variant="ghost" loading={pending} onClick={resetPassword}>
        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
        Reset password
      </Button>

      {user.lockedUntil ? (
        <Button size="sm" variant="ghost" loading={pending} onClick={unlock}>
          <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
          Unlock
        </Button>
      ) : null}
    </div>
  );
}