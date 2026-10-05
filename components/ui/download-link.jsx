'use client';

import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Download link for a generated file (CSV export, print view).
 *
 * An <a> is deliberate here, not an oversight: these URLs return a file with a
 * Content-Disposition header, so they must be a real navigation rather than
 * client-side routing. Next's `no-html-link-for-pages` rule cannot tell the
 * difference, so it is disabled for this component only.
 */
export function DownloadLink({ href, label = 'Export CSV', className, variant = 'secondary' }) {
  return (
    <a
      /* eslint-disable-next-line @next/next/no-html-link-for-pages */
      href={href}
      download
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors',
        variant === 'primary'
          ? 'bg-navy-800 text-white hover:bg-navy-900'
          : 'border border-navy-200 bg-white text-navy-800 hover:bg-navy-50',
        className,
      )}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}

/** Compact variant for use inside a table toolbar. */
export function DownloadLinkSmall({ href, label = 'CSV', className }) {
  return (
    <a
      /* eslint-disable-next-line @next/next/no-html-link-for-pages */
      href={href}
      download
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-navy-200 bg-white px-3 text-xs font-medium text-navy-800 transition-colors hover:bg-navy-50',
        className,
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}