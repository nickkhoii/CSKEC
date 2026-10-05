'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { getSessionUser, requireUserApi } from '@/lib/session';
import { getCurrentMember } from '@/lib/session';
import { setPassword, verifyPassword } from '@/lib/password';
import { notifications } from '@/lib/notifications';
import { dashboardPathForRole } from '@/lib/rbac';
import { safeRedirectPath, normalizeEmail } from '@/lib/utils';
import { loginSchema, changePasswordSchema, updateProfileSchema } from '@/validations/schemas';
import { fromZod, ok, runAction, str } from './helpers';

/** Message shown on the login screen. Deliberately vague about *why*. */
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';
const INACTIVE_MESSAGE =
  'This account is not active. Please contact the club System Administrator.';

export async function loginAction(_prevState, formData) {
  const parsed = loginSchema.safeParse({
    email: str(formData, 'email'),
    password: str(formData, 'password'),
    callbackUrl: str(formData, 'callbackUrl'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const { email, password, callbackUrl } = parsed.data;

  try {
    await signIn('credentials', {
      email: normalizeEmail(email),
      password,
      redirect: false,
    });
  } catch (error) {
    // Auth.js redirects by throwing; anything else is a real failure.
    console.error('[auth] sign-in failed', error?.message ?? error);
    return { success: false, message: GENERIC_LOGIN_ERROR };
  }

  // Re-read the session so we can route to the right dashboard.
  const user = await getSessionUser();
  if (!user) return { success: false, message: GENERIC_LOGIN_ERROR };
  if (user.status !== 'ACTIVE') {
    await signOut({ redirect: false });
    return { success: false, message: INACTIVE_MESSAGE };
  }

  const target = safeRedirectPath(
    callbackUrl,
    dashboardPathForRole(user.role),
  );
  redirect(target);
}

export async function logoutAction() {
  await signOut({ redirect: false });
  redirect('/login');
}

export async function changePasswordAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Your session has expired. Please sign in again.' };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: str(formData, 'currentPassword'),
    newPassword: str(formData, 'newPassword'),
    confirmPassword: str(formData, 'confirmPassword'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(
    async () => {
      const account = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      const matches = await verifyPassword(parsed.data.currentPassword, account?.passwordHash);
      if (!matches) {
        return { success: false, message: 'Your current password is incorrect.' };
      }

      await setPassword(user.id, parsed.data.newPassword);
      await audit({
        category: 'AUTH',
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: user.id,
        description: 'User changed their own password.',
        user: { id: user.id, email: user.email, role: user.role },
      });
      return ok(null, 'Password updated. Other sessions have been signed out.');
    },
    { friendly: {}, silent: true },
  );
}

export async function updateProfileAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Your session has expired. Please sign in again.' };

  const member = await getCurrentMember();
  if (!member) {
    return {
      success: false,
      message: 'Your account is not linked to a member record. Please contact the Secretary.',
    };
  }

  const parsed = updateProfileSchema.safeParse({
    contactNumber: str(formData, 'contactNumber'),
    address: str(formData, 'address'),
    emergencyName: str(formData, 'emergencyName'),
    emergencyPhone: str(formData, 'emergencyPhone'),
    birthday: str(formData, 'birthday'),
    bloodType: str(formData, 'bloodType'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(async () => {
    const updated = await prisma.member.update({
      where: { id: member.id },
      data: {
        contactNumber: parsed.data.contactNumber,
        address: parsed.data.address,
        emergencyName: parsed.data.emergencyName,
        emergencyPhone: parsed.data.emergencyPhone,
        birthday: parsed.data.birthday ? new Date(parsed.data.birthday) : null,
        bloodType: parsed.data.bloodType,
      },
      select: { id: true },
    });

    await audit({
      category: 'MEMBER',
      action: 'PROFILE_UPDATED',
      entity: 'Member',
      entityId: member.id,
      description: 'Member updated their own profile contact details.',
      user: { id: user.id, email: user.email, role: user.role },
    });

    revalidatePath('/profile');
    return updated;
  });
}

export async function markNotificationsReadAction(ids) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).slice(0, 200);
  const count = await notifications.markRead(user.id, list);
  revalidatePath('/notifications');
  revalidatePath('/member/dashboard');
  return ok({ count }, count > 0 ? 'Marked as read.' : 'Already read.');
}

export async function markAllNotificationsReadAction() {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  const count = await notifications.markAllRead(user.id);
  revalidatePath('/notifications');
  return ok({ count }, `${count} notification${count === 1 ? '' : 's'} marked as read.`);
}