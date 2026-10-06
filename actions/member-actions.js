'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { audit, diffFields } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUserApi, can } from '@/lib/session';
import { hashPassword, passwordStrengthIssues } from '@/lib/password';
import { reserveMemberNumber, isValidMemberNumber } from '@/lib/member-id';
import { createMemberSchema, updateMemberSchema } from '@/validations/schemas';
import { fromZod, ok, runAction, str } from './helpers';

/**
 * ---------------------------------------------------------------------------
 * Member encoding (Secretary module)
 * ---------------------------------------------------------------------------
 * Creating a member optionally creates the portal account inside the same
 * transaction, so a half-created member + user pair is impossible.
 *
 * Uniqueness of `memberNumber` and `email` is enforced by database constraints;
 * the action translates P2002 into a readable field error.
 */

export async function createMemberAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired. Please sign in again.' };
  if (!(await can(PERMISSIONS.MEMBER_MANAGE))) {
    return { success: false, message: 'You do not have permission to manage members.' };
  }

  const parsed = createMemberSchema.safeParse({
    firstName: str(formData, 'firstName'),
    middleName: str(formData, 'middleName'),
    lastName: str(formData, 'lastName'),
    suffix: str(formData, 'suffix'),
    email: str(formData, 'email'),
    contactNumber: str(formData, 'contactNumber'),
    address: str(formData, 'address'),
    birthday: str(formData, 'birthday'),
    dateJoined: str(formData, 'dateJoined'),
    bloodType: str(formData, 'bloodType'),
    emergencyName: str(formData, 'emergencyName'),
    emergencyPhone: str(formData, 'emergencyPhone'),
    notes: str(formData, 'notes'),
    memberNumber: str(formData, 'memberNumber'),
    status: str(formData, 'status') ?? 'ACTIVE',
    createAccount: str(formData, 'createAccount'),
    accountPassword: str(formData, 'accountPassword'),
    role: str(formData, 'role'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;
  if (data.createAccount && data.role && data.role !== 'MEMBER') {
    return { success: false, message: 'The Secretary can create member accounts only. An administrator assigns officer roles.' };
  }
  if (data.createAccount && !data.accountPassword) {
    return { success: false, message: 'An initial password is required to create an account.' };
  }

  if (data.accountPassword) {
    const issues = await passwordStrengthIssues(data.accountPassword);
    if (issues.length > 0) {
      return {
        success: false,
        message: 'The initial password does not meet the password policy.',
        fieldErrors: { accountPassword: `Password ${issues.join(', ')}.` },
      };
    }
  }

return runAction(
    async () => {
      const roleId = data.createAccount
        ? (await prisma.role.findUnique({ where: { key: data.role ?? 'MEMBER' } }))?.id
        : null;

      if (data.createAccount && !roleId) {
        return { success: false, message: 'The selected role is not configured.' };
      }

      const passwordHash = data.createAccount ? await hashPassword(data.accountPassword) : null;

      const created = await prisma.$transaction(async (tx) => {
        // Only auto-generate a member number when the Secretary left it blank.
        const memberNumber =
          data.memberNumber && isValidMemberNumber(data.memberNumber)
            ? data.memberNumber.toUpperCase()
            : (await reserveMemberNumber({ tx })).memberNumber;

        const member = await tx.member.create({
          data: {
            memberNumber,
            firstName: data.firstName,
            middleName: data.middleName,
            lastName: data.lastName,
            suffix: data.suffix,
            email: data.email,
            contactNumber: data.contactNumber,
            address: data.address,
            birthday: data.birthday ? new Date(data.birthday) : null,
            dateJoined: new Date(data.dateJoined),
            bloodType: data.bloodType,
            emergencyName: data.emergencyName,
            emergencyPhone: data.emergencyPhone,
            notes: data.notes,
            status: data.status,
            createdById: user.id,
          },
        });

        if (passwordHash) {
          const account = await tx.user.create({
            data: {
              email: data.email,
              fullName: `${data.firstName} ${data.lastName}`.trim(),
              passwordHash,
              roleId,
              memberId: member.id,
              status: 'ACTIVE',
              mustChangePassword: true,
              passwordChangedAt: new Date(),
            },
            select: { id: true },
          });
          await tx.member.update({ where: { id: member.id }, data: { userId: account.id } });
        }

        return member;
      });

      await audit({
        category: 'MEMBER',
        action: 'MEMBER_CREATED',
        entity: 'Member',
        entityId: created.id,
        description: `Member ${created.memberNumber} (${created.firstName} ${created.lastName}) was encoded.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: {
          memberNumber: created.memberNumber,
          status: created.status,
          accountCreated: Boolean(passwordHash),
        },
      });

      revalidatePath('/secretary/members');
      revalidatePath('/secretary/dashboard');
      return ok(
        { id: created.id, memberNumber: created.memberNumber },
        `Member ${created.memberNumber} created successfully.`,
      );
    },
    {
      friendly: {
        duplicate: 'That member ID or email address is already registered.',
        missing: 'A related record could not be found.',
      },
    },
  );
}

export async function updateMemberAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired. Please sign in again.' };
  if (!(await can(PERMISSIONS.MEMBER_MANAGE))) {
    return { success: false, message: 'You do not have permission to manage members.' };
  }

  const parsed = updateMemberSchema.safeParse({
    id: str(formData, 'id'),
    firstName: str(formData, 'firstName'),
    middleName: str(formData, 'middleName'),
    lastName: str(formData, 'lastName'),
    suffix: str(formData, 'suffix'),
    email: str(formData, 'email'),
    contactNumber: str(formData, 'contactNumber'),
    address: str(formData, 'address'),
    birthday: str(formData, 'birthday'),
    dateJoined: str(formData, 'dateJoined'),
    bloodType: str(formData, 'bloodType'),
    emergencyName: str(formData, 'emergencyName'),
    emergencyPhone: str(formData, 'emergencyPhone'),
    notes: str(formData, 'notes'),
    status: str(formData, 'status'),
  });
  if (!parsed.success) return fromZod(parsed.error);

return runAction(async () => {
    const before = await prisma.member.findUnique({
      where: { id: parsed.data.id },
      select: {
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        contactNumber: true,
        address: true,
        status: true,
        dateJoined: true,
        emergencyName: true,
        emergencyPhone: true,
        notes: true,
      },
    });
    if (!before) return { success: false, message: 'That member no longer exists.' };

    const data = parsed.data;
    const updated = await prisma.member.update({
      where: { id: data.id },
      data: {
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        suffix: data.suffix,
        email: data.email,
        contactNumber: data.contactNumber,
        address: data.address,
        birthday: data.birthday ? new Date(data.birthday) : null,
        dateJoined: new Date(data.dateJoined),
        bloodType: data.bloodType,
        emergencyName: data.emergencyName,
        emergencyPhone: data.emergencyPhone,
        notes: data.notes,
        status: data.status,
      },
    });

    // Keep the portal account's display name and email in step with the profile.
    const linkedUser = await prisma.user.findUnique({
      where: { memberId: data.id },
      select: { id: true },
    });
    if (linkedUser) {
      await prisma.user.update({
        where: { id: linkedUser.id },
        data: { email: data.email, fullName: `${data.firstName} ${data.lastName}`.trim() },
      });
    }

    await audit({
      category: 'MEMBER',
      action: 'MEMBER_UPDATED',
      entity: 'Member',
      entityId: updated.id,
      description: `Member ${updated.memberNumber} record was updated.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { changes: diffFields(before, updated) },
    });

    revalidatePath('/secretary/members');
    revalidatePath(`/secretary/members/${updated.id}`);
    return ok({ id: updated.id }, 'Member record updated.');
  });
}

/**
 * Changes a member's membership status.
 * Membership status and account status are separate concerns: a member can be
 * EXPUNGED while their portal account is deactivated by the System Administrator.
 */
export async function setMemberStatusAction(memberId, status) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.MEMBER_MANAGE))) {
    return { success: false, message: 'You do not have permission to manage members.' };
  }
  if (!['ACTIVE', 'INACTIVE', 'EXPUNGED'].includes(status)) {
    return { success: false, message: 'Select a valid membership status.' };
  }

  return runAction(async () => {
    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { status },
    });
    await audit({
      category: 'MEMBER',
      action: 'MEMBER_STATUS_CHANGED',
      entity: 'Member',
      entityId: memberId,
      description: `Member ${updated.memberNumber} status set to ${status}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { status },
    });
    revalidatePath('/secretary/members');
    return ok({ id: memberId }, `Membership status set to ${status.toLowerCase()}.`);
  });
}
