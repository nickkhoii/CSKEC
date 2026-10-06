'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUserApi, can } from '@/lib/session';
import { notifications } from '@/lib/notifications';
import { storeUpload } from '@/lib/storage';
import { setSetting } from '@/lib/settings';
import {
  approvePaymentSubmission,
  rejectPaymentSubmission,
  recordManualPayment,
  generateMonthlyDues,
  generateCommunityServiceObligations,
  createObligation,
  waiveObligation,
  refreshObligation,
} from '@/lib/finance';
import {
  generateDuesSchema,
  manualPaymentSchema,
  obligationSchema,
  paymentReviewSchema,
  paymentSubmissionSchema,
  transactionSchema,
  voidTransactionSchema,
  waiveObligationSchema,
} from '@/validations/schemas';
import { fromZod, ok, runAction, str, list } from './helpers';

/**
 * ---------------------------------------------------------------------------
 * Finance actions (Treasurer module)
 * ---------------------------------------------------------------------------
 * Only holders of the matching `finance:*` permission reach these functions, and
 * the services re-check every invariant inside their own transaction.
 */

const unauthorized = {
  success: false,
  message: 'You do not have permission to perform this financial action.',
};

/** A member submits a payment for Treasurer verification. */
export async function submitPaymentAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired. Please sign in again.' };
  if (!(await can(PERMISSIONS.FINANCE_SUBMIT_PAYMENT))) return unauthorized;
  if (!user.memberId) {
    return { success: false, message: 'Your account is not linked to a member record.' };
  }

  const parsed = paymentSubmissionSchema.safeParse({
    obligationId: str(formData, 'obligationId'),
    type: str(formData, 'type'),
    periodMonth: str(formData, 'periodMonth') ?? '',
    periodYear: str(formData, 'periodYear') ?? '',
    amount: str(formData, 'amount'),
    paymentDate: str(formData, 'paymentDate'),
    referenceNumber: str(formData, 'referenceNumber'),
    paymentMethod: str(formData, 'paymentMethod'),
    notes: str(formData, 'notes'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const proof = formData?.get?.('proof');

return runAction(
    async () => {
      const data = parsed.data;

      // A member may never post against somebody else's obligation.
      if (data.obligationId) {
        const obligation = await prisma.financialObligation.findUnique({
          where: { id: data.obligationId },
          select: { memberId: true, status: true },
        });
        if (!obligation) return { success: false, message: 'That obligation does not exist.' };
        if (obligation.memberId !== user.memberId) {
          return { success: false, message: 'You can only pay your own obligations.' };
        }
        if (obligation.status === 'PAID') {
          return { success: false, message: 'That obligation is already fully paid.' };
        }
        if (obligation.status === 'WAIVED') {
          return { success: false, message: 'That obligation has been waived.' };
        }
      }

      const duplicate = await prisma.paymentSubmission.findUnique({
        where: {
          memberId_referenceNumber: {
            memberId: user.memberId,
            referenceNumber: data.referenceNumber,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        return {
          success: false,
          message: 'You have already submitted a payment with that reference number.',
        };
      }

      let attachment = null;
      if (proof && typeof proof === 'object' && proof.size > 0) {
        const stored = await storeUpload(proof, 'proof-of-payment');
        attachment = { ...stored, kind: 'PROOF_OF_PAYMENT' };
      }

      const submission = await prisma.paymentSubmission.create({
        data: {
          memberId: user.memberId,
          obligationId: data.obligationId,
          type: data.type,
          periodMonth: data.periodMonth || null,
          periodYear: data.periodYear || null,
          amount: data.amount,
          paymentDate: new Date(data.paymentDate),
          referenceNumber: data.referenceNumber,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          status: 'PENDING_VERIFICATION',
          ...(attachment
            ? { attachments: { create: { ...attachment, uploadedById: user.id } } }
            : {}),
        },
      });

      // Reflect the pending state on the obligation straight away.
      if (data.obligationId) {
        await prisma.financialObligation.updateMany({
          where: {
            id: data.obligationId,
            status: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
          },
          data: { status: 'PENDING_VERIFICATION' },
        });
      }

      await audit({
        category: 'FINANCE',
        action: 'PAYMENT_SUBMITTED',
        entity: 'PaymentSubmission',
        entityId: submission.id,
        description: `${user.name} submitted a payment of ${data.amount.toFixed(2)} for verification.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: {
          amount: data.amount,
          referenceNumber: data.referenceNumber,
          paymentMethod: data.paymentMethod,
          proofAttached: Boolean(attachment),
        },
      });

      await notifications.paymentSubmitted({ submissionId: submission.id, memberName: user.name });

      revalidatePath('/payments');
      revalidatePath('/treasurer/payments');
      return ok({ id: submission.id }, 'Payment submitted and is awaiting Treasurer verification.');
    },
    { friendly: { duplicate: 'You have already submitted that reference number.' }, silent: true },
  );
}

/** Treasurer approves or rejects a submitted payment. */
export async function reviewPaymentAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_REVIEW_PAYMENT))) {
    return { success: false, message: 'Only a Treasurer can verify payments.' };
  }

  const parsed = paymentReviewSchema.safeParse({
    submissionId: str(formData, 'submissionId'),
    decision: str(formData, 'decision'),
    remarks: str(formData, 'remarks'),
    obligationId: str(formData, 'obligationId'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const reviewer = { id: user.id, name: user.name, memberId: user.memberId };
  const reviewId = parsed.data.submissionId;
  const remarks = parsed.data.remarks;

  return runAction(
    async () => {
      if (parsed.data.decision === 'REJECT') {
        const result = await rejectPaymentSubmission({
          submissionId: reviewId,
          reviewer,
          remarks,
        });

        await audit({
          category: 'FINANCE',
          action: 'PAYMENT_REJECTED',
          entity: 'PaymentSubmission',
          entityId: reviewId,
          description: `${user.name} rejected a payment submission.`,
          user: { id: user.id, email: user.email, role: user.role },
          metadata: { remarks: remarks ?? null },
        });
        await notifications.paymentReviewed({
          memberUserId: result.memberUserId,
          approved: false,
          amount: 0,
          remarks,
        });

        revalidatePath('/treasurer/payments');
        revalidatePath('/payments');
        return ok(null, 'Payment submission rejected.');
      }

      const result = await approvePaymentSubmission({
        submissionId: reviewId,
        reviewer,
        obligationId: parsed.data.obligationId,
        remarks,
      });

      await audit({
        category: 'FINANCE',
        action: 'PAYMENT_APPROVED',
        entity: 'PaymentSubmission',
        entityId: reviewId,
        description: `${user.name} approved a payment of ${result.amount.toFixed(2)}.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: {
          amount: result.amount,
          paymentId: result.payment.id,
          transactionId: result.transaction.id,
          obligationId: result.obligation?.id ?? null,
          remarks: remarks ?? null,
        },
      });

      await notifications.paymentReviewed({
        memberUserId: result.memberUserId,
        approved: true,
        amount: result.amount,
        remarks,
      });

      revalidatePath('/treasurer/payments');
      revalidatePath('/payments');
      revalidatePath('/treasurer/dashboard');
      return ok(
        { paymentId: result.payment.id, transactionId: result.transaction.id },
        'Payment approved and posted to the ledger.',
      );
    },
    { silent: true },
  );
}

/** Treasurer records an offline/cash payment with no member submission. */
export async function manualPaymentAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_RECORD_MANUAL_PAYMENT))) return unauthorized;

  const parsed = manualPaymentSchema.safeParse({
    memberId: str(formData, 'memberId'),
    obligationId: str(formData, 'obligationId'),
    amount: str(formData, 'amount'),
    paymentDate: str(formData, 'paymentDate'),
    referenceNumber: str(formData, 'referenceNumber'),
    paymentMethod: str(formData, 'paymentMethod'),
    remarks: str(formData, 'remarks'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const data = parsed.data;
    const result = await recordManualPayment({
      ...data,
      paymentDate: new Date(data.paymentDate),
      reviewer: { id: user.id, name: user.name, memberId: user.memberId },
    });

    await audit({
      category: 'FINANCE',
      action: 'PAYMENT_RECORDED_MANUAL',
      entity: 'Payment',
      entityId: result.payment.id,
      description: `${user.name} recorded a manual payment of ${result.payment.amount.toFixed(2)}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: {
        memberId: data.memberId,
        amount: result.payment.amount,
        referenceNumber: data.referenceNumber,
        transactionId: result.transaction.id,
      },
    });

    revalidatePath('/treasurer/payments');
    revalidatePath('/treasurer/dashboard');
    return ok({ id: result.payment.id }, 'Manual payment recorded and posted.');
  });
}

/** Generates monthly dues for a period. Idempotent. */
export async function generateDuesAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_MANAGE_DUES))) return unauthorized;

  const parsed = generateDuesSchema.safeParse({
    periodMonth: str(formData, 'periodMonth'),
    periodYear: str(formData, 'periodYear'),
    amount: str(formData, 'amount'),
    dueDate: str(formData, 'dueDate'),
    scope: str(formData, 'scope') ?? 'ALL',
    memberIds: list(formData, 'memberIds'),
    note: str(formData, 'note'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const result = await generateMonthlyDues({
      periodMonth: parsed.data.periodMonth,
      periodYear: parsed.data.periodYear,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate,
      scope: parsed.data.scope,
      memberIds: parsed.data.memberIds,
      createdById: user.id,
      note: parsed.data.note,
    });

    await audit({
      category: 'FINANCE',
      action: 'DUES_GENERATED',
      entity: 'FinancialObligation',
      description: `${user.name} generated monthly dues: ${result.created} created, ${result.skipped} already existed.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: {
        periodMonth: parsed.data.periodMonth,
        periodYear: parsed.data.periodYear,
        amount: parsed.data.amount,
        created: result.created,
        skipped: result.skipped,
        scope: parsed.data.scope,
      },
    });

    revalidatePath('/treasurer/dues');
    revalidatePath('/treasurer/dashboard');
    return ok(
      result,
      `${result.created} dues obligation${result.created === 1 ? '' : 's'} created${
        result.skipped ? `, ${result.skipped} skipped (already existing)` : ''
      }.`,
    );
  });
}

/** Generates community-service obligations from a published activity. */
export async function generateCommunityServiceAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_MANAGE_OBLIGATIONS))) return unauthorized;

  const activityId = str(formData, 'activityId');
  const amount = str(formData, 'amount');
  const dueDate = str(formData, 'dueDate');
  if (!activityId || !amount || !dueDate) {
    return {
      success: false,
      message: 'Select an activity and provide both a fee amount and a due date.',
    };
  }

  return runAction(async () => {
    const result = await generateCommunityServiceObligations({
      activityId,
      amount,
      dueDate,
      createdById: user.id,
    });

    await audit({
      category: 'FINANCE',
      action: 'COMMUNITY_SERVICE_OBLIGATIONS_GENERATED',
      entity: 'Activity',
      entityId: activityId,
      description: `${user.name} generated ${result.created} community service obligations.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { ...result, amount, dueDate },
    });

    revalidatePath('/treasurer/obligations');
    return ok(result, `${result.created} community service obligation(s) created.`);
  });
}

/** Creates a single ad-hoc obligation. */
export async function createObligationAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_MANAGE_OBLIGATIONS))) return unauthorized;

  const parsed = obligationSchema.safeParse({
    memberId: str(formData, 'memberId'),
    type: str(formData, 'type'),
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    periodMonth: str(formData, 'periodMonth') ?? '',
    periodYear: str(formData, 'periodYear') ?? '',
    amountDue: str(formData, 'amountDue'),
    dueDate: str(formData, 'dueDate'),
    activityId: str(formData, 'activityId'),
    notes: str(formData, 'notes'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const created = await createObligation({ ...parsed.data, createdById: user.id });
    await audit({
      category: 'FINANCE',
      action: 'OBLIGATION_CREATED',
      entity: 'FinancialObligation',
      entityId: created.id,
      description: `${user.name} created an obligation of ${created.amountDue.toFixed(2)}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { type: created.type, memberId: created.memberId, amount: created.amountDue },
    });
    revalidatePath('/treasurer/obligations');
    return ok({ id: created.id }, 'Obligation created.');
  });
}

/** Waives an obligation (kept in the ledger, flagged WAIVED). */
export async function waiveObligationAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_WAIVE_OBLIGATION))) return unauthorized;

  const parsed = waiveObligationSchema.safeParse({
    obligationId: str(formData, 'obligationId'),
    reason: str(formData, 'reason'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const updated = await waiveObligation({
      obligationId: parsed.data.obligationId,
      reason: parsed.data.reason,
      waivedById: user.id,
    });
    await audit({
      category: 'FINANCE',
      action: 'OBLIGATION_WAIVED',
      entity: 'FinancialObligation',
      entityId: updated.id,
      description: `${user.name} waived an obligation. Reason: ${parsed.data.reason}`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { reason: parsed.data.reason },
    });
    revalidatePath('/treasurer/obligations');
    revalidatePath('/treasurer/delinquent');
    return ok(null, 'Obligation waived.');
  });
}

/** Posts a general income or expense entry to the ledger. */
export async function createTransactionAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS))) return unauthorized;

  const parsed = transactionSchema.safeParse({
    type: str(formData, 'type'),
    categoryId: str(formData, 'categoryId'),
    transactionDate: str(formData, 'transactionDate'),
    description: str(formData, 'description'),
    amount: str(formData, 'amount'),
    reference: str(formData, 'reference'),
    memberId: str(formData, 'memberId'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const data = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(17002)`;
    const category = await tx.transactionCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.type !== data.type) {
      const error = new Error('Select an active category matching the transaction type.');
      error.name = 'FinanceError';
      throw error;
    }
    const year = new Date(data.transactionDate).getFullYear();
    const count = await tx.financialTransaction.count({
      where: { transactionNumber: { startsWith: `TXN-${year}-` } },
    });

    return tx.financialTransaction.create({
      data: {
        transactionNumber: `TXN-${year}-${String(count + 1).padStart(4, '0')}`,
        transactionDate: new Date(data.transactionDate),
        type: data.type,
        categoryId: data.categoryId,
        description: data.description,
        amount: data.amount,
        reference: data.reference,
        memberId: data.memberId,
        recordedById: user.id,
        recordedByName: user.name,
      },
    });
    });

    await audit({
      category: 'FINANCE',
      action: data.type === 'INCOME' ? 'TRANSACTION_INCOME_ADDED' : 'TRANSACTION_EXPENSE_ADDED',
      entity: 'FinancialTransaction',
      entityId: created.id,
      description: `${user.name} recorded ${data.type.toLowerCase()} of ${data.amount.toFixed(2)}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { amount: data.amount, categoryId: data.categoryId },
    });

    revalidatePath('/treasurer/transactions');
    revalidatePath('/treasurer/dashboard');
    return ok({ id: created.id }, 'Transaction recorded.');
  });
}

/**
 * Voids a ledger entry. Financial history is never deleted: a void keeps the row,
 * its amount and its reason so the ledger stays auditable.
 */
export async function voidTransactionAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.FINANCE_VOID_TRANSACTION))) return unauthorized;

  const parsed = voidTransactionSchema.safeParse({
    transactionId: str(formData, 'transactionId'),
    reason: str(formData, 'reason'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const before = await prisma.financialTransaction.findUnique({
      where: { id: parsed.data.transactionId },
      select: { id: true, status: true, amount: true, paymentId: true, transactionNumber: true },
    });
    if (!before) return { success: false, message: 'That transaction does not exist.' };
    if (before.status === 'VOIDED') {
      return { success: false, message: 'That transaction is already voided.' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(17002)`;
      const transaction = await tx.financialTransaction.update({
      where: { id: parsed.data.transactionId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: user.id,
        voidReason: parsed.data.reason,
      },
      });
      if (before.paymentId) {
        const payment = await tx.payment.findUnique({ where: { id: before.paymentId }, select: { obligationId: true } });
        if (payment?.obligationId) await refreshObligation(tx, payment.obligationId);
      }
      return transaction;
    });

    await audit({
      category: 'FINANCE',
      action: 'TRANSACTION_VOIDED',
      entity: 'FinancialTransaction',
      entityId: updated.id,
      description: `${user.name} voided transaction ${updated.transactionNumber}. Reason: ${parsed.data.reason}`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { amount: before.amount, reason: parsed.data.reason, paymentId: before.paymentId },
    });

    revalidatePath('/treasurer/transactions');
    revalidatePath('/treasurer/dashboard');
    return ok(null, `Transaction ${updated.transactionNumber} voided.`);
  });
}

/** Updates a system setting (System Administrator). */
export async function updateSettingAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.SETTINGS_MANAGE))) return unauthorized;

  const key = str(formData, 'key');
  const value = str(formData, 'value');
  if (!key) return { success: false, message: 'Missing setting key.' };

  return runAction(async () => {
  const updated = await setSetting(key, value, user.id);
  await audit({
    category: 'ADMIN',
    action: 'SETTING_UPDATED',
    entity: 'SystemSetting',
    entityId: updated.id,
    description: `${user.name} updated setting "${key}".`,
    user: { id: user.id, email: user.email, role: user.role },
    metadata: { key, value },
  });
  revalidatePath('/admin/settings');
  revalidatePath('/settings');
  return ok({ key }, 'Setting updated.');
  });
}
