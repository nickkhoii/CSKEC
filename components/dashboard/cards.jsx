import { cn } from '@/lib/utils';
import { Card } from '@/components/ui';

/**
 * Dashboard KPI card. Kept intentionally flat: a club portal should present
 * numbers clearly rather than decorate them.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'navy',
  href,
  footer,
  className,
}) {
  const tones = {
    navy: 'bg-navy-50 text-navy-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
    gold: 'bg-gold-50 text-gold-700',
    slate: 'bg-slate-100 text-slate-600',
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
              tones[tone] ?? tones.navy,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p> : null}
      {footer ? <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px]">{footer}</div> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className="block rounded-lg transition-shadow hover:shadow-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500">
        <Card className={cn('h-full p-5', className)}>{body}</Card>
      </a>
    );
  }

  return <Card className={cn('h-full p-5', className)}>{body}</Card>;
}

/** Section heading used between groups of cards on a dashboard. */
export function SectionHeading({ title, description, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-2', className)}>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Compact list row used by the "latest updates" / "upcoming events" panels. */
export function ListRow({ title, meta, href, badge, className }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        {meta ? <p className="mt-0.5 truncate text-[11px] text-ink-muted">{meta}</p> : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          'flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-slate-50',
          className,
        )}
      >
        {content}
      </a>
    );
  }
  return <div className={cn('flex items-center gap-3 px-2 py-2.5', className)}>{content}</div>;
}