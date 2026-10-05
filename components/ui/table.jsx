import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ---------------------------------------------------------------------------
 * Data table + pagination + search/filter bar
 * ---------------------------------------------------------------------------
 * Server-driven: the page owns the query string, so lists stay paginated on the
 * server instead of shipping thousands of rows to the browser.
 *
 * INTENTIONALLY NOT `'use client'`.
 * These are static markup helpers with no hooks and no browser APIs.
 * `<Pagination buildHref={...} />` receives a function created in the server
 * page, which React cannot serialise into a Client Component - marking this file
 * as client made every paginated list throw a 500.
 */

export function Table({ className, children, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-left">{children}</thead>;
}

export function TH({ className, children, align = 'left', ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TR({ className, children, ...props }) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-50/70', className)} {...props}>
      {children}
    </tr>
  );
}

export function TD({ className, children, align = 'left', ...props }) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-ink',
        align === 'right' && 'text-right tabular-nums',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** @param {{ page:number, pageSize:number, total:number, buildHref:(p:number)=>string }} props */
export function Pagination({ page, pageSize, total, buildHref }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs"
    >
      <p className="text-ink-muted">
        Showing <span className="font-medium text-ink">{from}</span>–
        <span className="font-medium text-ink">{to}</span> of{' '}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>
        {start > 1 ? <span className="px-1 text-ink-muted">…</span> : null}
        {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((number) => (
          <PageLink key={number} href={buildHref(number)} active={number === page}>
            {number}
          </PageLink>
        ))}
        {end < pages ? <span className="px-1 text-ink-muted">…</span> : null}
        <PageLink href={buildHref(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, children, active, disabled, ...props }) {
  const className = cn(
    'inline-flex h-7 min-w-7 items-center justify-center rounded border px-1.5 font-medium transition-colors',
    active
      ? 'border-navy-700 bg-navy-800 text-white'
      : 'border-slate-300 bg-white text-ink-soft hover:border-navy-400 hover:text-navy-800',
    disabled && 'pointer-events-none opacity-40',
  );
  if (disabled) {
    return (
      <span className={className} aria-disabled="true" {...props}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} {...props}>
      {children}
    </Link>
  );
}

/** GET-form text input used inside a <FilterBar>. */
export function SearchInput({ defaultValue = '', placeholder = 'Search…', name = 'q', className }) {
  return (
    <input
      type="search"
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn(
        'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm',
        'focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 sm:w-64',
        className,
      )}
    />
  );
}

export function SelectFilter({ name, value, options, placeholder = 'All', className }) {
  return (
    <select
      name={name}
      defaultValue={value ?? ''}
      aria-label={placeholder}
      className={cn(
        'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-ink',
        'focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Wraps search/filter controls in a GET form that stays on the current path. */
export function FilterBar({ children, action, className }) {
  return (
    <form
      method="GET"
      action={action}
      className={cn('flex flex-wrap items-end gap-2 border-b border-slate-200 px-4 py-3', className)}
    >
      {children}
    </form>
  );
}

export function FilterActions({ children }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>;
}