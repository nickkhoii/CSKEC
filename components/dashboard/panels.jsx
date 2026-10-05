import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui';

/**
 * ---------------------------------------------------------------------------
 * Reusable dashboard panels
 * ---------------------------------------------------------------------------
 * Every role dashboard renders the same handful of shapes. These components keep
 * the dashboards short and make the visual language identical across modules.
 */

/** Card wrapper with a standard header (title, description, action link). */
export function Panel({ title, description, action, children, className, bodyClassName = 'p-0' }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <CardBody className={bodyClassName}>{children}</CardBody>
    </Card>
  );
}

/** Card that renders an empty state instead of its children when there is no data. */
export function DataPanel({
  title,
  description,
  action,
  rows,
  emptyIcon,
  emptyTitle = 'Nothing to show yet',
  emptyDescription,
  children,
  className,
  bodyClassName = 'p-0',
}) {
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <CardBody className={bodyClassName}>
        {isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}

/** Builds a column spec for <SimpleTable>. */
export function col(key, header, { align, render, width } = {}) {
  return { key, header, align, render, width };
}

/**
 * Minimal table renderer:
 *   columns = [{ key, header, align?, render?(row) }]
 */
export function SimpleTable({ columns, rows, rowKey = 'id', emptyText = 'No rows' }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={[
                  'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted',
                  column.align === 'right' ? 'text-right' : '',
                  column.align === 'center' ? 'text-center' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row[rowKey] ?? row.key} className="transition-colors hover:bg-slate-50/70">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    'px-4 py-3 align-middle text-ink',
                    column.align === 'right' ? 'text-right tabular-nums' : '',
                    column.align === 'center' ? 'text-center' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {column.render ? column.render(row) : (row[column.key] ?? '\u2014')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-ink-muted">{emptyText}</p>
      ) : null}
    </div>
  );
}

/** Stat card grid that tolerates a missing icon/tone. */
export function CardGrid({ cards, columns = 'sm:grid-cols-2 xl:grid-cols-4' }) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            {card.icon ? <StatIcon icon={card.icon} tone={card.tone} /> : null}
          </div>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${card.tone ?? 'text-ink'}`}>
            {card.value}
          </p>
          {card.hint ? <p className="mt-0.5 text-[11px] text-ink-muted">{card.hint}</p> : null}
        </Card>
      ))}
    </div>
  );
}

const TONES = {
  navy: 'bg-navy-50 text-navy-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  gold: 'bg-gold-50 text-gold-700',
  slate: 'bg-slate-100 text-slate-600',
};

function StatIcon({ icon: Icon, tone }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
        TONES[tone] ?? TONES.navy
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** Row of pill links used for "quick actions" blocks. */
export function LinkRow({ links }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-navy-800 transition-colors hover:bg-navy-50"
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {link.label}
          </a>
        );
      })}
    </div>
  );
}