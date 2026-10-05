import { redirect } from 'next/navigation';
import { Receipt, Wallet } from 'lucide-react';
import { requireCurrentMember, requireUser } from '@/lib/session';
import { memberFinancialSummary } from '@/lib/finance';
import { formatPeso, moneyToNumber, paidPercentage } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import {
  OBLIGATION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABELS,
  SUBMISSION_STATUS_BADGE,
  SUBMISSION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader, PrintButton } from '@/components/page';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatusBadge } from '@/components/ui';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { SubmitPaymentForm } from '@/components/member/submit-payment-form';

export const metadata = { title: 'Dues & Payments' };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const user = await requireUser();
  if (!user.memberId) redirect('/profile');
  const member = await requireCurrentMember();

  const finances = await memberFinancialSummary(member.id);
  const { totals } = finances;

  // Only obligations that can actually be paid right now are offered in the form.
  const payable = [...finances.dues, ...finances.communityService, ...finances.otherFees]
    .filter((row) => row.status !== 'PAID' && row.status !== 'WAIVED')
    .map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      typeLabel: OBLIGATION_TYPE_LABELS[row.type],
      balanceText: Number(row.balance).toFixed(2),
    }));

  const sections = [
    { title: 'Monthly Dues', rows: finances.dues },
    { title: 'Community Service', rows: finances.communityService },
    { title: 'Other Fees', rows: finances.otherFees },
  ];

  const summaryCards = [
    { label: 'Total Billed', value: formatPeso(totals.billed), tone: 'text-ink' },
    { label: 'Total Paid', value: formatPeso(totals.paid), tone: 'text-emerald-700' },
    {
      label: 'Outstanding',
      value: formatPeso(totals.outstanding),
      tone: moneyToNumber(totals.outstanding) > 0 ? 'text-rose-700' : 'text-ink',
    },
    {
      label: 'Overdue',
      value: formatPeso(totals.overdue),
      tone: moneyToNumber(totals.overdue) > 0 ? 'text-rose-700' : 'text-ink',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dues &amp; Payments"
        description="Your obligations, balances and payment history. Submitted payments are verified by the club Treasurer."
        actions={<PrintButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${card.tone}`}>{card.value}</p>
          </Card>
        ))}
      </div>

      {moneyToNumber(totals.overdue) > 0 ? (
        <Alert tone="warning" title={`${totals.overdueCount} overdue obligation(s)`}>
          {formatPeso(totals.overdue)} is past its due date. Submit a payment below to clear it.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Submit a payment" description="For verification by the club Treasurer." />
        <CardBody>
          <SubmitPaymentForm obligations={payable} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="My obligations"
          description="Amount due, amount paid, remaining balance and status."
        />
        <CardBody className="space-y-6 p-0">
          {sections.map((section) => (
            <ObligationSection key={section.title} title={section.title} rows={section.rows} />
          ))}
        </CardBody>
      </Card>

      <SubmissionsTable rows={finances.submissions} />
      <PaymentsTable rows={finances.payments} />
    </div>
  );
}
function ObligationSection({ title, rows }) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </h3>
        <p className="px-5 pb-4 text-xs text-ink-muted">Nothing in this category.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => {
          const percent = paidPercentage(row.amountDue, row.amountPaid);
          const period =
            row.periodYear && row.periodMonth
              ? ` \u00b7 ${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}`
              : '';
          return (
            <li key={row.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Due {formatDate(row.dueDate)}
                    {period}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatPeso(row.balance)}
                  </span>
                  <StatusBadge
                    value={row.status}
                    labels={PAYMENT_STATUS_LABELS}
                    tones={PAYMENT_STATUS_BADGE}
                  />
                </div>
              </div>
              <ProgressBar
                className="mt-2"
                value={percent}
                label={`${percent}% paid`}
                tone={percent >= 100 ? 'bg-emerald-500' : 'bg-navy-600'}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Paid {formatPeso(row.amountPaid)} of {formatPeso(row.amountDue)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubmissionsTable({ rows }) {
  return (
    <Card>
      <CardHeader
        title="Payment submissions"
        description="Each submission is verified by the Treasurer before it affects your balance."
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No submissions yet"
            description="Payments you submit for verification will be listed here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Type</TH>
                <TH align="right">Amount</TH>
                <TH>Method</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Remarks</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">{row.referenceNumber}</TD>
                  <TD className="text-xs">{OBLIGATION_TYPE_LABELS[row.type]}</TD>
                  <TD align="right" className="text-xs font-semibold">
                    {formatPeso(row.amount)}
                  </TD>
                  <TD className="text-xs">{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(row.paymentDate)}</TD>
                  <TD>
                    <StatusBadge
                      value={row.status}
                      labels={SUBMISSION_STATUS_LABELS}
                      tones={SUBMISSION_STATUS_BADGE}
                    />
                  </TD>
                  <TD className="max-w-xs text-[11px] text-ink-muted">{row.reviewRemarks ?? '\u2014'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentsTable({ rows }) {
  return (
    <Card>
      <CardHeader
        title="Approved payments"
        description="Payments already verified and posted to the club ledger."
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No approved payments yet"
            description="Once the Treasurer approves a submission it will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Payment No.</TH>
                <TH>Applied to</TH>
                <TH align="right">Amount</TH>
                <TH>Method</TH>
                <TH>Date</TH>
                <TH>Approved by</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">{row.paymentNumber}</TD>
                  <TD className="text-xs">{row.obligation?.title ?? '\u2014'}</TD>
                  <TD align="right" className="text-xs font-semibold text-emerald-700">
                    {formatPeso(row.amount)}
                  </TD>
                  <TD className="text-xs">{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(row.paymentDate)}</TD>
                  <TD className="text-xs text-ink-soft">
                    {row.approvedByName ?? '\u2014'}
                    {row.isManual ? (
                      <Badge tone="bg-slate-100 text-slate-700 ring-slate-200" className="ml-2">
                        Manual
                      </Badge>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}