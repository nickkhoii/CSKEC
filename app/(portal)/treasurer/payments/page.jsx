import { FileText, Filter, Receipt } from 'lucide-react';
import { requireRole, can, PERMISSIONS } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { readListParams } from '@/lib/queries';
import { formatPeso, moneyToString } from '@/lib/money';
import { fullName } from '@/lib/utils';
import { buildQueryString, formatDate, formatRelative } from '@/lib/utils';
import {
  OBLIGATION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  SUBMISSION_STATUS_BADGE,
  SUBMISSION_STATUS_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/page';
import { StatusBadge } from '@/components/ui';
import { DataPanel, SimpleTable, col } from '@/components/dashboard/panels';
import { FilterBar, Pagination, SearchInput, SelectFilter } from '@/components/ui/table';
import { PaymentReviewButtons, ProofLink } from '@/components/approvals/payment-review';
import { ManualPaymentModal } from '@/components/finance/manual-payment-modal';

export const metadata = { title: 'Payment Verification' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default async function TreasurerPaymentsPage({ searchParams }) {
  const treasurer = await requireRole('TREASURER');
  const params = await searchParams;
  const { q, status, page, pageSize, skip, take } = readListParams(params, { allowedStatuses: STATUS_OPTIONS.map((s) => s.value),
    defaultPageSize: 20,
  });
  const canRecordManual = await can(PERMISSIONS.FINANCE_RECORD_MANUAL_PAYMENT);

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { referenceNumber: { contains: q, mode: 'insensitive' } },
            { member: { memberNumber: { contains: q, mode: 'insensitive' } } },
            { member: { firstName: { contains: q, mode: 'insensitive' } } },
            { member: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, submissions, memberRows] = await Promise.all([
    prisma.paymentSubmission.count({ where }),
    prisma.paymentSubmission.findMany({
      where,
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        status: true,
        type: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        referenceNumber: true,
        notes: true,
        reviewRemarks: true,
        reviewedByName: true,
        submittedAt: true,
        member: {
          select: { id: true, firstName: true, middleName: true, lastName: true, memberNumber: true },
        },
        obligation: { select: { id: true, title: true, balance: true, status: true } },
        attachments: { select: { id: true, url: true, mimeType: true } },
        payment: { select: { id: true, paymentNumber: true } },
      },
    }),
    canRecordManual
      ? prisma.member.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { lastName: 'asc' },
          take: 500,
          select: {
            id: true,
            memberNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            obligations: {
              where: { status: { in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'PENDING_VERIFICATION'] } },
              orderBy: { dueDate: 'desc' },
              select: { id: true, title: true, balance: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // A Treasurer may never verify their own payment.
  const canReview = (row) => !treasurer.memberId || treasurer.memberId !== row.member.id;
  const buildHref = (nextPage) =>
    `/treasurer/payments${buildQueryString({ ...params, page: nextPage })}`;

  const pendingCount = submissions.filter((row) => row.status === 'PENDING_VERIFICATION').length;

  const payableMembers = memberRows.map((m) => ({
    id: m.id,
    name: fullName(m),
    memberNumber: m.memberNumber,
    obligations: m.obligations.map((o) => ({
      id: o.id,
      title: o.title,
      balanceText: moneyToString(o.balance),
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Verification"
        description="Approving a payment posts it to the club ledger and updates the member's outstanding balance exactly once."
        actions={
          canRecordManual ? <ManualPaymentModal members={payableMembers} /> : null
        }
      />

      <DataPanel
        title="Payment submissions"
        description={`${total} submission(s) match the current filter`}
        rows={submissions}
        emptyIcon={Receipt}
        emptyTitle="No payment submissions"
        emptyDescription="Nothing matches the current search or status filter."
      >
        <FilterBar action="/treasurer/payments">
          <SearchInput defaultValue={q ?? ''} placeholder="Search reference or member…" />
          <SelectFilter
            name="status"
            value={status ?? ''}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-800 px-3 text-xs font-medium text-white hover:bg-navy-900"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Filter
          </button>
        </FilterBar>

        <SubmissionTable rows={submissions} canReview={canReview} />
        <Pagination page={page} pageSize={pageSize} total={total} buildHref={buildHref} />
      </DataPanel>

      {pendingCount > 0 ? (
        <p className="text-[11px] text-ink-muted">
          {pendingCount} submission(s) on this page still need a decision.
        </p>
      ) : null}
    </div>
  );
}

function SubmissionTable({ rows, canReview }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        col('member', 'Member', {
          render: (r) => (
            <>
              <p className="font-medium text-ink">{fullName(r.member)}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{r.member.memberNumber}</p>
            </>
          ),
        }),
        col('obligation', 'Applied to', {
          render: (r) => (
            <>
              <p className="text-xs font-medium text-ink">
                {r.obligation?.title ?? 'Not linked'}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {OBLIGATION_TYPE_LABELS[r.type]}
                {r.obligation ? ` \u00b7 balance ${formatPeso(r.obligation.balance)}` : ''}
              </p>
            </>
          ),
        }),
        col('amount', 'Amount', {
          align: 'right',
          render: (r) => <span className="text-sm font-semibold text-ink">{formatPeso(r.amount)}</span>,
        }),
        col('referenceNumber', 'Reference', {
          render: (r) => (
            <>
              <p className="text-xs font-medium">{r.referenceNumber}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {PAYMENT_METHOD_LABELS[r.paymentMethod]} &middot; {formatDate(r.paymentDate)}
              </p>
            </>
          ),
        }),
        col('proof', 'Proof', {
          render: (r) => <ProofLink attachments={r.attachments} />,
        }),
        col('status', 'Status', {
          render: (r) => (
            <>
              <StatusBadge
                value={r.status}
                labels={SUBMISSION_STATUS_LABELS}
                tones={SUBMISSION_STATUS_BADGE}
              />
              {r.payment ? (
                <p className="mt-1 text-[10px] text-emerald-700">{r.payment.paymentNumber}</p>
              ) : null}
              {r.reviewRemarks ? (
                <p className="mt-1 max-w-[12rem] text-[10px] text-ink-muted">{r.reviewRemarks}</p>
              ) : null}
            </>
          ),
        }),
        col('submittedAt', 'Submitted', {
          render: (r) => (
            <span className="whitespace-nowrap text-[11px] text-ink-muted">
              {formatRelative(r.submittedAt)}
            </span>
          ),
        }),
        col('action', 'Decision', {
          align: 'right',
          render: (r) =>
            r.status !== 'PENDING_VERIFICATION' ? (
              <span className="text-[11px] text-ink-muted">
                {r.reviewedByName ? `by ${r.reviewedByName}` : 'Reviewed'}
              </span>
            ) : (
              <PaymentReviewButtons
                submissionId={r.id}
                balance={r.obligation?.balance == null ? null : moneyToString(r.obligation.balance)}
                disabled={!canReview(r)}
                disabledReason="You cannot verify your own payment"
              />
            ),
        }),
      ]}
    />
  );
}
