import { cn } from '@/lib/utils';

/**
 * ---------------------------------------------------------------------------
 * Design-system primitives
 * ---------------------------------------------------------------------------
 * Deliberately restrained: a club-management portal should feel formal and calm,
 * so components use a single subtle shadow, a 1px border and small radii.
 *
 * INTENTIONALLY NOT `'use client'`.
 * These are pure, stateless presentational components with no hooks and no browser
 * APIs, so they render correctly in both trees. Marking this file as a Client
 * Component broke every server-rendered page: pages pass icon components
 * (`<EmptyState icon={Megaphone} />`) and table `render` callbacks into these
 * primitives, and React refuses to serialise a function across the RSC boundary
 * ("Functions cannot be passed directly to Client Components").
 *
 * Primitives that genuinely need the browser live in their own client files:
 * form.jsx, modal.jsx, table.jsx, toast.jsx.
 */

const VARIANTS = {
  primary:
    'bg-navy-800 text-white hover:bg-navy-900 focus-visible:outline-navy-900 disabled:bg-navy-300',
  secondary:
    'bg-white text-navy-800 border border-navy-200 hover:bg-navy-50 focus-visible:outline-navy-500 disabled:text-navy-300',
  ghost:
    'bg-transparent text-ink-soft hover:bg-navy-50 hover:text-navy-900 focus-visible:outline-navy-400',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-700 disabled:bg-rose-300',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-700 disabled:bg-emerald-300',
  gold: 'bg-gold-500 text-navy-950 hover:bg-gold-600 focus-visible:outline-gold-600 disabled:bg-gold-200',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
  icon: 'h-9 w-9 p-0',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled,
  children,
  ref,
  ...props
}) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-70',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, title, description, action, children, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {title ? <h3 className="text-sm font-semibold text-ink">{title}</h3> : null}
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-slate-200 px-5 py-3', className)} {...props} />
  );
}

export function Badge({ className, tone = 'bg-slate-100 text-slate-700 ring-slate-200', children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset',
        tone,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps any known status enum to its badge colour via the tables in lib/constants. */
export function StatusBadge({ value, labels, tones, className }) {
  const tone = tones?.[value] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = labels?.[value] ?? value ?? '\u2014';
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

export function Alert({ className, tone = 'info', title, children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-4 py-3 text-sm', tones[tone] ?? tones.info, className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-slate-200', className)} />;
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className={cn('flex items-center justify-center p-8', className)}>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-navy-300 border-t-navy-700" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Consistent empty state for every table/list in the portal. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-500">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, action }) {
  return (
    <Alert tone="error" title={title}>
      {message}
      {action ? <div className="mt-3">{action}</div> : null}
    </Alert>
  );
}

export function ProgressBar({ value = 0, className, tone = 'bg-navy-600', label }) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}
    >
      <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Avatar({ name, src, size = 'md', className }) {
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn('rounded-full object-cover', sizes[size], className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-white',
        sizes[size],
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

export function Divider({ className, label }) {
  if (!label) return <hr className={cn('border-slate-200', className)} />;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <hr className="flex-1 border-slate-200" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <hr className="flex-1 border-slate-200" />
    </div>
  );
}