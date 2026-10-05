'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button } from './ui';
import { useToast } from './ui/toast';
import { cn } from '@/lib/utils';

/**
 * ---------------------------------------------------------------------------
 * Page header + feedback wrappers
 * ---------------------------------------------------------------------------
 * `PageHeader` is the single title block used by every page, so spacing and
 * typography stay consistent across all five role modules.
 */

export function PageHeader({ title, description, actions, breadcrumb, className }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-[11px] text-ink-muted">{breadcrumb}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Print button - reports and minutes are designed to be printed. */
export function PrintButton({ label = 'Print', className }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => {
        if (typeof window !== 'undefined') window.print();
      }}
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}

/**
 * Wraps a server action so the calling component gets a uniform result and the
 * user always sees a toast. Returns `{ run, pending }`.
 */
export function useAction(action) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const toast = useToast();

  const run = (payload) =>
    new Promise((resolve) => {
      startTransition(async () => {
        const response = await action(payload);
        setResult(response ?? null);
        if (response?.message) {
          if (response.success) toast.success(response.message);
          else toast.error(response.message);
        }
        resolve(response);
      });
    });

  return { run, pending, result, setResult };
}

/**
 * Standard feedback block for a server action rendered inside a form:
 * shows the error/success message and a hint when a field needs attention.
 */
export function ActionFeedback({ state, className }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.success ? 'status' : 'alert'}
      className={cn(
        'rounded-md border px-3 py-2 text-xs font-medium',
        state.success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800',
        className,
      )}
    >
      {state.message}
    </p>
  );
}

/** Small definition-list style key/value row used on detail pages. */
export function DetailRow({ label, value, className }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-ink">{value ?? '\u2014'}</dd>
    </div>
  );
}

/** Section heading used inside forms and detail panels. */
export function FormSection({ title, description, children, columns = 2, className }) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      {title ? (
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </legend>
      ) : null}
      {description ? <p className="text-xs text-ink-muted">{description}</p> : null}
      <div
        className={cn(
          'grid gap-4',
          columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {children}
      </div>
    </fieldset>
  );
}

/** Forces a page to re-fetch on mount (used after an action mutates data). */
export function useRefreshOnMount(enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (enabled) router.refresh();
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}