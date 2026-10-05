import { ShieldCheck } from 'lucide-react';
import { requirePermission, PERMISSIONS } from '@/lib/session';
import { listCurrentOfficers, listOfficerHistory } from '@/lib/officers';
import { formatDate, fullName } from '@/lib/utils';
import { OFFICER_STATUS_BADGE, OFFICER_STATUS_LABELS } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { DownloadLinkSmall } from '@/components/ui/download-link';

export const metadata = { title: 'Club Officers' };
export const dynamic = 'force-dynamic';

export default async function OfficersPage() {
  await requirePermission(PERMISSIONS.OFFICER_VIEW);

  const [officers, history] = await Promise.all([
    listCurrentOfficers(),
    listOfficerHistory({ limit: 100 }),
  ]);

  const vacancies = officers.filter((office) => !office.assignment);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Officers"
        description="Current office holders and the full officer history of the club. Historical terms are never deleted."
        actions={<PrintButton />}
      />

      {vacancies.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>
            {vacancies.length} vacant office{vacancies.length === 1 ? '' : 's'}:
          </strong>{' '}
          {vacancies.map((office) => office.name).join(', ')}
        </div>
      ) : null}

      <DataPanel
        title="Current officers"
        description={`${officers.filter((o) => o.assignment).length} of ${officers.length} offices filled`}
        rows={officers}
        emptyIcon={ShieldCheck}
        emptyTitle="No offices configured"
        emptyDescription="Officer positions have not been set up yet."
      >
        <SimpleTable
          rows={officers}
          rowKey="code"
          columns={[
            col('name', 'Office', {
              render: (r) => (
                <>
                  <p className="font-medium text-ink">{r.name}</p>
                  {r.description ? (
                    <p className="mt-0.5 text-[11px] text-ink-muted">{r.description}</p>
                  ) : null}
                </>
              ),
            }),
            col('holder', 'Holder', {
              render: (r) =>
                r.assignment ? (
                  <>
                    <p className="text-sm text-ink">
                      {r.assignment.member.firstName} {r.assignment.member.lastName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                      {r.assignment.member.memberNumber}
                    </p>
                  </>
                ) : (
                  <Badge tone="bg-amber-100 text-amber-900 ring-amber-200">Vacant</Badge>
                ),
            }),
            col('term', 'Term', {
              render: (r) =>
                r.assignment ? (
                  <span className="whitespace-nowrap text-xs text-ink-soft">
                    {formatDate(r.assignment.termStart)} &ndash;{' '}
                    {r.assignment.termEnd ? formatDate(r.assignment.termEnd) : 'present'}
                  </span>
                ) : (
                  '\u2014'
                ),
            }),
          ]}
        />
      </DataPanel>

      <DataPanel
        title="Officer history"
        description="Every term ever recorded. Ending a term keeps the record."
        rows={history}
        emptyIcon={ShieldCheck}
        emptyTitle="No officer history yet"
        action={<DownloadLinkSmall href="/api/reports/officers" label="Export" />}
      >
        <SimpleTable
          rows={history}
          columns={[
            col('member', 'Member', {
              render: (r) => (
                <>
                  <p className="font-medium text-ink">
                    {r.member.firstName} {r.member.lastName}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                    {r.member.memberNumber}
                  </p>
                </>
              ),
            }),
            col('position', 'Office', {
              render: (r) => <span className="text-sm">{r.position.name}</span>,
            }),
            col('termStart', 'From', {
              render: (r) => (
                <span className="whitespace-nowrap text-xs">{formatDate(r.termStart)}</span>
              ),
            }),
            col('termEnd', 'To', {
              render: (r) => (
                <span className="whitespace-nowrap text-xs">
                  {r.termEnd ? formatDate(r.termEnd) : 'present'}
                </span>
              ),
            }),
            col('status', 'Status', {
              render: (r) => (
                <StatusBadge
                  value={r.status}
                  labels={OFFICER_STATUS_LABELS}
                  tones={OFFICER_STATUS_BADGE}
                />
              ),
            }),
            col('appointedBy', 'Appointed by', {
              render: (r) => (
                <span className="text-[11px] text-ink-muted">{r.appointedBy?.fullName ?? '\u2014'}</span>
              ),
            }),
          ]}
        />
      </DataPanel>
    </div>
  );
}