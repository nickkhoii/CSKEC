'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUserApi, can } from '@/lib/session';
import {
  hashPassword,
  passwordStrengthIssues,
  resetPassword,
  unlockAccount,
} from '@/lib/password';
import { notifications } from '@/lib/notifications';
import { resolveMemberId, syncMemberAccount } from '@/lib/user-members';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  adminResetPasswordSchema,
} from '@/validations/schemas';
import { fromZod, ok, runAction, str, passwordValue } from './helpers';

/**
 * ---------------------------------------------------------------------------
 * User administration (System Administrator module)
 * ---------------------------------------------------------------------------
 * Accounts referenced by transactions, attendance, minutes or the audit trail are
 * NEVER hard-deleted. Deactivation sets `status` and `deletedAt`, which blocks
 * sign-in immediately (both `authorize()` and the middleware re-check status) and
 * revokes every outstanding session via `tokenVersion`.
 */

const denied = {
  success: false,
  message: 'Only a System Administrator can manage user accounts.',
};

export async function createUserAction(_prevState, formData) {
  const actor = await requireUserApi();
  if (!actor) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.USER_MANAGE))) return denied;

  const parsed = createUserSchema.safeParse({
    email: str(formData, 'email'),
    fullName: str(formData, 'fullName'),
    role: str(formData, 'role'),
    password: passwordValue(formData, 'password'),
    status: str(formData, 'status') ?? 'ACTIVE',
    memberId: str(formData, 'memberId'),
    mustChangePassword: str(formData, 'mustChangePassword'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(
    async () => {
      const role = await prisma.role.findUnique({ where: { key: data.role } });
      if (!role) return { success: false, message: 'That role is not configured.' };
      data.memberId = await resolveMemberId(prisma, data.memberId);

      // A member record can only be linked to one account.
      if (data.memberId) {
        const linked = await prisma.user.findUnique({
          where: { memberId: data.memberId },
          select: { id: true, email: true },
        });
        if (linked) {
          return {
            success: false,
            message: `That member record is already linked to the account ${linked.email}.`,
          };
        }
      }

      const passwordHash = await hashPassword(data.password);
      const created = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          passwordHash,
          roleId: role.id,
          status: data.status,
          memberId: data.memberId,
          mustChangePassword: data.mustChangePassword,
          passwordChangedAt: new Date(),
        },
        select: { id: true, email: true },
      });
      await syncMemberAccount(tx, account.id, data.memberId);
      return account;
      });

      await audit({
        category: 'ADMIN',
        action: 'USER_CREATED',
        entity: 'User',
        entityId: created.id,
        description: `${actor.name} created the account ${created.email} with role ${data.role}.`,
        user: { id: actor.id, email: actor.email, role: actor.role },
        metadata: { role: data.role, status: data.status, memberId: data.memberId },
      });

      revalidatePath('/admin/users');
      revalidatePath('/admin/dashboard');
      return ok({ id: created.id }, `Account created for ${created.email}.`);
    },
    { friendly: { duplicate: 'That email address is already registered to an account.' } },
  );
}

export async function updateUserAction(_prevState, formData) {
  const actor = await requireUserApi();
  if (!actor) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.USER_MANAGE))) return denied;

  const parsed = updateUserSchema.safeParse({
    id: str(formData, 'id'),
    fullName: str(formData, 'fullName'),
    email: str(formData, 'email'),
    role: str(formData, 'role'),
    status: str(formData, 'status'),
    memberId: str(formData, 'memberId'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  // Guard rail: an administrator must not demote or deactivate themselves.
  if (data.id === actor.id && (data.status !== 'ACTIVE' || data.role !== 'SYSTEM_ADMIN')) {
    return {
      success: false,
      message: 'You cannot change your own role or deactivate your own account.',
    };
  }

  return runAction(
    async () => {
      const role = await prisma.role.findUnique({ where: { key: data.role } });
      if (!role) return { success: false, message: 'That role is not configured.' };

      const before = await prisma.user.findUnique({
        where: { id: data.id },
        select: { id: true, role: { select: { key: true } }, status: true },
      });
      if (!before) return { success: false, message: 'That account no longer exists.' };
      data.memberId = await resolveMemberId(prisma, data.memberId);

      // Never leave the club without an active System Administrator.
      if (
        before.role.key === 'SYSTEM_ADMIN' &&
        (data.role !== 'SYSTEM_ADMIN' || data.status !== 'ACTIVE')
      ) {
        const remaining = await prisma.user.count({
          where: {
            role: { key: 'SYSTEM_ADMIN' },
            status: 'ACTIVE',
            deletedAt: null,
            id: { not: data.id },
          },
        });
        if (remaining === 0) {
          return { success: false, message: 'At least one active System Administrator must remain.' };
        }
      }

      if (data.memberId) {
        const linked = await prisma.user.findUnique({
          where: { memberId: data.memberId },
          select: { id: true },
        });
        if (linked && linked.id !== data.id) {
          return { success: false, message: 'That member record is already linked to another account.' };
        }
      }

      const roleChanged = before.role.key !== data.role;
      const statusChanged = before.status !== data.status;

      const updated = await prisma.$transaction(async (tx) => {
      const account = await tx.user.update({
        where: { id: data.id },
        data: {
          email: data.email,
          fullName: data.fullName,
          roleId: role.id,
          status: data.status,
          memberId: data.memberId,
          // A role or status change invalidates every existing session token.
          ...(roleChanged || statusChanged ? { tokenVersion: { increment: 1 } } : {}),
          ...(statusChanged ? { deletedAt: data.status === 'DEACTIVATED' ? new Date() : null } : {}),
        },
        select: { id: true, email: true },
      });
      await syncMemberAccount(tx, account.id, data.memberId);
      return account;
      });

      await audit({
        category: 'ADMIN',
        action: roleChanged
          ? 'USER_ROLE_CHANGED'
          : statusChanged
            ? 'USER_STATUS_CHANGED'
            : 'USER_UPDATED',
        entity: 'User',
        entityId: data.id,
        description: `${actor.name} updated ${updated.email} (role ${before.role.key} -> ${data.role}, status ${before.status} -> ${data.status}).`,
        user: { id: actor.id, email: actor.email, role: actor.role },
        metadata: {
          roleFrom: before.role.key,
          roleTo: data.role,
          statusFrom: before.status,
          statusTo: data.status,
        },
      });

      if (statusChanged && data.status !== 'ACTIVE') {
        await notifications.accountStatusChanged({
          userId: data.id,
          status: data.status,
          actorName: actor.name,
        });
      }

      revalidatePath('/admin/users');
      revalidatePath('/admin/dashboard');
      return ok({ id: data.id }, 'Account updated.');
    },
    { friendly: { duplicate: 'That email address is already registered to an account.' } },
  );
}

/**
 * Activate / mark inactive / deactivate an account.
 * Deactivating also stamps `deletedAt` (soft delete) and revokes all sessions.
 */
export async function setUserStatusAction(formData) {
  const actor = await requireUserApi();
  if (!actor) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.USER_STATUS_MANAGE))) return denied;

  const parsed = updateUserStatusSchema.safeParse({
    userId: str(formData, 'userId'),
    status: str(formData, 'status'),
    reason: str(formData, 'reason'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const { userId, status, reason } = parsed.data;

  if (userId === actor.id) {
    return { success: false, message: 'You cannot change the status of your own account.' };
  }

  return runAction(
    async () => {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, status: true, role: { select: { key: true } } },
      });
      if (!target) return { success: false, message: 'That account no longer exists.' };

      if (target.role.key === 'SYSTEM_ADMIN' && status !== 'ACTIVE') {
        const remaining = await prisma.user.count({
          where: {
            role: { key: 'SYSTEM_ADMIN' },
            status: 'ACTIVE',
            deletedAt: null,
            id: { not: userId },
          },
        });
        if (remaining === 0) {
          return { success: false, message: 'At least one active System Administrator must remain.' };
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          status,
          deletedAt: status === 'DEACTIVATED' ? new Date() : null,
          tokenVersion: { increment: 1 },
          ...(status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
      });

      await audit({
        category: 'ADMIN',
        action: `USER_${status}`,
        entity: 'User',
        entityId: userId,
        description: `${actor.name} set ${target.email} to ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        user: { id: actor.id, email: actor.email, role: actor.role },
        metadata: { from: target.status, to: status, reason: reason ?? null },
      });

      await notifications.accountStatusChanged({
        userId,
        status,
        actorName: actor.name,
      });

      revalidatePath('/admin/users');
      revalidatePath('/admin/dashboard');
      return ok(
        null,
        status === 'ACTIVE'
          ? 'Account activated. The user can sign in again.'
          : `Account ${status.toLowerCase()}. All sessions were signed out and the record was retained.`,
      );
    },
    { silent: true },
  );
}

/** Administrative password reset: forces a change at the next sign-in. */
export async function resetUserPasswordAction(formData) {
  const actor = await requireUserApi();
  if (!actor) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.USER_PASSWORD_RESET))) return denied;

  const parsed = adminResetPasswordSchema.safeParse({
    userId: str(formData, 'userId'),
    newPassword: passwordValue(formData, 'newPassword'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const issues = await passwordStrengthIssues(parsed.data.newPassword);
  if (issues.length > 0) {
    return {
      success: false,
      message: 'The new password does not meet the password policy.',
      fieldErrors: { newPassword: `Password ${issues.join(', ')}.` },
    };
  }

  return runAction(
    async () => {
      const target = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, email: true },
      });
      if (!target) return { success: false, message: 'That account no longer exists.' };

      await resetPassword(parsed.data.userId, parsed.data.newPassword);

      // The password itself is never placed in the audit payload.
      await audit({
        category: 'ADMIN',
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: parsed.data.userId,
        description: `${actor.name} reset the password for ${target.email}.`,
        user: { id: actor.id, email: actor.email, role: actor.role },
        metadata: { targetEmail: target.email, mustChangePassword: true },
      });

      revalidatePath('/admin/users');
      return ok(null, 'Password reset. The user must change it at next sign-in.');
    },
    { silent: true },
  );
}

/** Clears a lockout caused by too many failed logins. */
export async function unlockUserAction(userId) {
  const actor = await requireUserApi();
  if (!actor) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.USER_MANAGE))) return denied;

  return runAction(async () => {
    await unlockAccount(userId);
    await audit({
      category: 'AUTH',
      action: 'ACCOUNT_UNLOCKED',
      entity: 'User',
      entityId: userId,
      description: `${actor.name} unlocked a user account.`,
      user: { id: actor.id, email: actor.email, role: actor.role },
    });
    revalidatePath('/admin/users');
    return ok(null, 'Account unlocked.');
  });
}
