'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUserApi, can } from '@/lib/session';
import {
  submitAttendanceRequest,
  cancelAttendanceRequest,
  reviewAttendanceRequest,
  recordManualAttendance,
} from '@/lib/attendance';
import { notifications } from '@/lib/notifications';
import { SETTING_KEYS, getNumberSetting, getSetting } from '@/lib/settings';
import { attendanceRequestSchema } from '@/validations/schemas';
import { fromZod, ok, runAction, str } from './helpers';

/**
 * ---------------------------------------------------------------------------
 * Attendance actions
 * ---------------------------------------------------------------------------
 * Clicking PRESENT only creates a *request*. The official record is written by
 * reviewAttendanceRequest, reachable only with `attendance:review` (Secretary).
 */

export async function submitAttendanceAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired. Please sign in again.' };
  if (!(await can(PERMISSIONS.ATTENDANCE_SUBMIT))) {
    return { success: false, message: 'You do not have permission to submit attendance.' };
  }
  if (!user.memberId) {
    return {
      success: false,
      message: 'Your account is not linked to a member record. Please contact the Secretary.',
    };
  }

  const parsed = attendanceRequestSchema.safeParse({
    activityId: str(formData, 'activityId'),
    remarks: str(formData, 'remarks'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const windowDays = getNumberSetting(
    await getSetting(SETTING_KEYS.ATTENDANCE_WINDOW_DAYS),
    7,
  );

  return runAction(
    async () => {
      const { request, reSubmitted } = await submitAttendanceRequest({
        activityId: parsed.data.activityId,
        memberId: user.memberId,
        remarks: parsed.data.remarks,
        windowDays,
      });

      const activity = await prisma.activity.findUnique({
        where: { id: parsed.data.activityId },
        select: { title: true },
      });

      await audit({
        category: 'ATTENDANCE',
        action: reSubmitted
          ? 'ATTENDANCE_REQUEST_RESUBMITTED'
          : 'ATTENDANCE_REQUEST_SUBMITTED',
        entity: 'AttendanceRequest',
        entityId: request.id,
        description: `${user.name} ${reSubmitted ? 're-submitted' : 'submitted'} an attendance request for "${activity?.title}".`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: { activityId: parsed.data.activityId, memberId: user.memberId },
      });

      await notifications.attendanceSubmitted({
        requestId: request.id,
        memberName: user.name,
        activityTitle: activity?.title ?? 'an activity',
      });

      revalidatePath('/attendance');
      revalidatePath('/secretary/attendance');
      return ok(
        { id: request.id },
        reSubmitted
          ? 'Attendance request re-submitted and is awaiting verification.'
          : 'Attendance request submitted and is awaiting Secretary verification.',
      );
    },
    { silent: true },
  );
}

export async function cancelAttendanceRequestAction(requestId) {
  const user = await requireUserApi();
  if (!user || !user.memberId) return { success: false, message: 'Session expired.' };

  return runAction(
    async () => {
      await cancelAttendanceRequest({ requestId, memberId: user.memberId });
      await audit({
        category: 'ATTENDANCE',
        action: 'ATTENDANCE_REQUEST_WITHDRAWN',
        entity: 'AttendanceRequest',
        entityId: requestId,
        description: 'Member withdrew a pending attendance request.',
        user: { id: user.id, email: user.email, role: user.role },
      });
      revalidatePath('/attendance');
      return ok(null, 'Attendance request withdrawn.');
    },
    { silent: true },
  );
}

/**
 * Approves or rejects an attendance request (Secretary only).
 * `can()` is the authoritative guard; the service additionally refuses
 * self-review inside the transaction, so the rule holds even under a race.
 */
export async function reviewAttendanceAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.ATTENDANCE_REVIEW))) {
    return { success: false, message: 'Only a Secretary can review attendance requests.' };
  }

  const decision = str(formData, 'decision');
  const requestId = str(formData, 'requestId');
  const recordStatus = str(formData, 'recordStatus') ?? 'PRESENT';
  const remarks = str(formData, 'remarks');

  if (!['APPROVE', 'REJECT'].includes(decision) || !requestId) {
    return { success: false, message: 'That review request is not valid.' };
  }

  return runAction(
    async () => {
      const result = await reviewAttendanceRequest({
        requestId,
        decision,
        recordStatus,
        remarks,
        reviewer: { id: user.id, memberId: user.memberId },
      });

      await audit({
        category: 'ATTENDANCE',
        action: decision === 'APPROVE' ? 'ATTENDANCE_APPROVED' : 'ATTENDANCE_REJECTED',
        entity: 'AttendanceRequest',
        entityId: requestId,
        description: `${user.name} ${decision === 'APPROVE' ? 'approved' : 'rejected'} an attendance request.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: {
          recordStatus: decision === 'APPROVE' ? recordStatus : null,
          remarks: remarks ?? null,
          recordId: result.record?.id ?? null,
        },
      });

      await notifications.attendanceReviewed({
        memberUserId: result.memberUserId,
        approved: decision === 'APPROVE',
        activityTitle: result.activityTitle,
        remarks,
      });

      revalidatePath('/secretary/attendance');
      revalidatePath('/attendance');
      revalidatePath('/meetings', 'layout');
      revalidatePath('/secretary/meetings');
      return ok(
        { recordId: result.record?.id ?? null },
        decision === 'APPROVE'
          ? 'Attendance approved and officially recorded.'
          : 'Attendance request rejected.',
      );
    },
    { silent: true },
  );
}

/** Bulk manual roll call (Secretary only). */
export async function manualAttendanceAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.ATTENDANCE_RECORD_MANUAL))) {
    return { success: false, message: 'You do not have permission to record attendance.' };
  }

  const activityId = str(formData, 'activityId');
  const recordStatus = str(formData, 'recordStatus') ?? 'PRESENT';
  const memberIds = (formData?.getAll?.('memberIds') ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);
  const remarks = str(formData, 'remarks');

  if (!activityId || memberIds.length === 0) {
    return { success: false, message: 'Select an activity and at least one member.' };
  }

  return runAction(async () => {
    const result = await recordManualAttendance({
      activityId,
      memberIds,
      recordStatus,
      remarks,
      recorder: { id: user.id },
    });

    await audit({
      category: 'ATTENDANCE',
      action: 'ATTENDANCE_MANUAL_RECORDED',
      entity: 'Activity',
      entityId: activityId,
      description: `${user.name} manually recorded ${result.created} attendance entr${result.created === 1 ? 'y' : 'ies'}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { recorded: result.created, skipped: result.skipped.length, recordStatus },
    });

    revalidatePath('/secretary/attendance');
    revalidatePath('/meetings', 'layout');
    revalidatePath('/secretary/meetings');
    return ok(
      { created: result.created, skipped: result.skipped.length },
      `${result.created} record${result.created === 1 ? '' : 's'} saved${
        result.skipped.length ? `, ${result.skipped.length} skipped (already recorded)` : ''
      }.`,
    );
  });
}
