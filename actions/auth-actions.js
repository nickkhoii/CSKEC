'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { requireUserApi } from '@/lib/session';
import { getCurrentMember } from '@/lib/session';
import { setPassword, verifyPassword } from '@/lib/password';
import { notifications } from '@/lib/notifications';
import { safeRedirectPath, normalizeEmail } from '@/lib/utils';
import { loginSchema, changePasswordSchema, updateProfileSchema } from '@/validations/schemas';
import { fromZod, ok, runAction, str, passwordValue } from './helpers';

/** Message shown on the login screen. Deliberately vague about *why*. */
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

export async function loginAction(_prevState, formData) {
  const parsed = loginSchema.safeParse({
    email: str(formData, 'email'),
    password: passwordValue(formData, 'password'),
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

  // Auth.js writes the cookie to the response; the incoming request still has
  // the old cookie. The next GET validates the fresh session and selects the
  // correct role dashboard (or the mandatory password-change page).
  redirect(safeRedirectPath(callbackUrl, '/dashboard'));
}

export async function logoutAction() {
  await signOut({ redirect: false });
  redirect('/login');
}

export async function changePasswordAction(_prevState, formData) {
  const user = await requireUserApi({ allowPasswordChange: true });
  if (!user) return { success: false, message: 'Your session has expired. Please sign in again.' };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: passwordValue(formData, 'currentPassword'),
    newPassword: passwordValue(formData, 'newPassword'),
    confirmPassword: passwordValue(formData, 'confirmPassword'),
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
      await signOut({ redirect: false });
      return ok(null, 'Password updated. Please sign in again with your new password.');
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
