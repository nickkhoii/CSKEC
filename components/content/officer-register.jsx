import { ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { listCurrentOfficers, listOfficerHistory } from '@/lib/officers';
import { formatDate, fullName } from '@/lib/utils';
import { OFFICER_STATUS_BADGE, OFFICER_STATUS_LABELS } from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Badge, Card, CardBody, CardHeader, StatusBadge } from '@/components/ui';
import { CardGrid, DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { DownloadLinkSmall } from '@/components/ui/download-link';
import { AppointOfficerModal, EndTermButton } from '@/components/content/officer-modals';

/**
 * ---------------------------------------------------------------------------
 * Officer register — shared by /secretary/officers and /president/officers.
 *
 * Two sections on purpose: the "current office holders" board and the full
 * append-only term history. History is never pruned, so the club can always
 * reconstruct who held which office and when.
 * ---------------------------------------------------------------------------
 */
export async function OfficerRegister({ title, description }) {
  const [current, history, positions, members] = await Promise.all([
    listCurrentOfficers(),
    listOfficerHistory({ limit: 300 }),
    prisma.officerPosition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.member.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { lastName: 'asc' },
      take: 500,
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
      },
    }),
  ]);

  const filled = current.filter((office) => office.assignment).length;
  const ended = history.filter((row) => row.status === 'ENDED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <AppointOfficerModal
              positions={positions}
              members={members.map((m) => ({
                id: m.id,
                name: fullName(m),
                memberNumber: m.memberNumber,
              }))}
            />
            <PrintButton />
          </>
        }
      />

      <CardGrid
        cards={[
          { label: 'Offices', value: current.length, hint: 'Active positions' },
          {
            label: 'Filled',
            value: `${filled}/${current.length}`,
            hint: filled === current.length ? 'All offices filled' : 'Vacancies remain',
            tone: filled === current.length ? 'text-emerald-700' : 'text-amber-700',
          },
          { label: 'Recorded Terms', value: history.length, hint: 'Retained permanently' },
          {
            label: 'Ended Terms',
            value: ended,
            hint: 'Historical appointments',
            tone: 'text-ink-muted',
          },
        ]}
      />

      <DataPanel
        title="Current office holders"
        description="A partial UNIQUE index in the database guarantees at most one CURRENT holder per position."
        rows={current}
        emptyIcon={ShieldCheck}
        emptyTitle="No offices configured"
        emptyDescription="Officer positions are seeded with the club's roles."
      >
        <SimpleTable
          rows={current}
          rowKey="code"
          columns={[
            col('name', 'Office', {
              render: (r) => (
                <>
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{r.code}</p>
                </>
              ),
            }),
            col('holder', 'Holder', {
              render: (r) =>
                r.assignment ? (
                  <>
                    <p className="text-sm text-ink">{fullName(r.assignment.member)}</p>
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
                    {formatDate(r.assignment.termStart)}
                    {r.assignment.termEnd
                      ? ` \u2013 ${formatDate(r.assignment.termEnd)}`
                      : ' \u2013 present'}
                  </span>
                ) : (
                  '\u2014'
                ),
            }),
            col('action', 'Action', {
              align: 'right',
              render: (r) =>
                r.assignment ? (
                  <EndTermButton assignment={{ ...r.assignment, position: { name: r.name } }} />
                ) : null,
            }),
          ]}
        />
      </DataPanel>

      <HistoryCard history={history} />
    </div>
  );
}
function HistoryCard({ history }) {
  return (
    <Card>
      <CardHeader
        title="Officer history"
        description="Every term ever recorded. Rows are never deleted."
        action={<DownloadLinkSmall href="/api/reports/officers" />}
      />
      <CardBody className="p-0">
        {history.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-ink-muted">
            No officer assignments recorded yet.
          </p>
        ) : (
          <SimpleTable
            rows={history}
            columns={[
              col('member', 'Member', {
                render: (r) => (
                  <>
                    <p className="font-medium text-ink">{fullName(r.member)}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                      {r.member.memberNumber}
                    </p>
                  </>
                ),
              }),
              col('position', 'Office', {
                render: (r) => <span className="text-xs">{r.position.name}</span>,
              }),
              col('term', 'Term', {
                render: (r) => (
                  <span className="whitespace-nowrap text-xs">
                    {formatDate(r.termStart)}
                    {r.termEnd ? ` \u2013 ${formatDate(r.termEnd)}` : ' \u2013 present'}
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
                  <span className="text-xs text-ink-soft">{r.appointedBy?.fullName ?? '\u2014'}</span>
                ),
              }),
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}
