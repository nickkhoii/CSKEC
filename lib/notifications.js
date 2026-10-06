import { prisma } from './prisma';

/**
 * ---------------------------------------------------------------------------
 * In-app notifications
 * ---------------------------------------------------------------------------
 * Notifications are written inside the same transaction as the action that
 * triggered them where practical, so a member never sees "payment approved"
 * without the corresponding ledger change having committed.
 */

/** Fans a notification out to every active user holding one of the roles. */
async function notifyRoles({ roles, type, title, message, link, entity, entityId, tx }) {
  const db = tx ?? prisma;
  const users = await db.user.findMany({
    where: { role: { key: { in: roles } }, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
    take: 500,
  });
  if (users.length === 0) return 0;
  const result = await db.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type,
      title,
      message,
      link: link ?? null,
      entity: entity ?? null,
      entityId: entityId ?? null,
    })),
  });
  return result.count;
}

/** Sends one notification to one user. */
async function notifyUser({ userId, type, title, message, link, entity, entityId, tx }) {
  if (!userId) return 0;
  const db = tx ?? prisma;
  const result = await db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      link: link ?? null,
      entity: entity ?? null,
      entityId: entityId ?? null,
    },
  });
  return result ? 1 : 0;
}

/** Every active user with a linked member record (i.e. a real club member). */
async function notifyAllMembers(payload) {
  const db = payload.tx ?? prisma;
  const users = await db.user.findMany({
    where: { status: 'ACTIVE', deletedAt: null, memberId: { not: null } },
    select: { id: true },
    take: 2000,
  });
  if (users.length === 0) return 0;
  const result = await db.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link ?? null,
      entity: payload.entity ?? null,
      entityId: payload.entityId ?? null,
    })),
  });
  return result.count;
}

export const notifications = {
  notifyUser,
  notifyRoles,
  notifyAllMembers,

  /** A member submitted an attendance request -> tell the Secretary team. */
  async attendanceSubmitted({ requestId, memberName, activityTitle }) {
    return notifyRoles({
      roles: ['SECRETARY'],
      type: 'ATTENDANCE_SUBMITTED',
      title: 'Attendance request submitted',
      message: `${memberName} requested attendance for "${activityTitle}".`,
      link: '/secretary/attendance?status=PENDING',
      entity: 'AttendanceRequest',
      entityId: requestId,
    });
  },

  async attendanceReviewed({ memberUserId, approved, activityTitle, remarks }) {
    return notifyUser({
      userId: memberUserId,
      type: approved ? 'ATTENDANCE_APPROVED' : 'ATTENDANCE_REJECTED',
      title: approved ? 'Attendance approved' : 'Attendance rejected',
      message: approved
        ? `Your attendance for "${activityTitle}" was approved.`
        : `Your attendance request for "${activityTitle}" was rejected.${
            remarks ? ` Remarks: ${remarks}` : ''
          }`,
      entity: 'AttendanceRequest',
    });
  },

  /** A member submitted a payment -> tell the Treasurer. */
  async paymentSubmitted({ submissionId, memberName }) {
    return notifyRoles({
      roles: ['TREASURER'],
      type: 'PAYMENT_SUBMITTED',
      title: 'Payment submitted for verification',
      message: `${memberName} submitted a payment awaiting verification.`,
      link: '/treasurer/payments?status=PENDING_VERIFICATION',
      entity: 'PaymentSubmission',
      entityId: submissionId,
    });
  },

  async paymentReviewed({ memberUserId, approved, amount, remarks }) {
    const peso = Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    return notifyUser({
      userId: memberUserId,
      type: approved ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
      title: approved ? 'Payment approved' : 'Payment rejected',
      message: approved
        ? `Your payment of PHP ${peso} was approved and posted to your account.`
        : `Your payment was rejected.${remarks ? ` Remarks: ${remarks}` : ''}`,
      entity: 'PaymentSubmission',
    });
  },

  /** A post/announcement was published -> tell every member. */
  async announcementPublished({ postId, title, categoryLabel }) {
    return notifyAllMembers({
      type: 'ANNOUNCEMENT_PUBLISHED',
      title: 'New club update published',
      message: `"${title}" was published under ${categoryLabel}.`,
      link: `/updates/${postId}`,
      entity: 'Post',
      entityId: postId,
    });
  },

  async noticePublished({ noticeId, title, priority, audienceLabel }) {
    const payload = {
      type: 'NOTICE_PUBLISHED',
      title: priority === 'URGENT' ? 'Urgent notice published' : 'New notice published',
      message: `${title} (audience: ${audienceLabel}).`,
      link: '/notices',
      entity: 'Notice',
      entityId: noticeId,
    };
    if (audienceLabel === 'ALL_MEMBERS') return notifyAllMembers(payload);
    const roles = audienceLabel === 'ALL_OFFICERS'
      ? ['SECRETARY', 'TREASURER', 'PRESIDENT', 'SYSTEM_ADMIN'] : [audienceLabel];
    return notifyRoles({ ...payload, roles });
  },

  async eventScheduled({ activityId, title, venue }) {
    return notifyAllMembers({
      type: 'EVENT_SCHEDULED',
      title: 'New club activity scheduled',
      message: `"${title}" is scheduled${venue ? ` at ${venue}` : ''}.`,
      link: `/attendance?activity=${activityId}`,
      entity: 'Activity',
      entityId: activityId,
    });
  },

  async paymentOverdue({ userId, amount, dueDate, label }) {
    const peso = Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    return notifyUser({
      userId,
      type: 'PAYMENT_OVERDUE',
      title: 'Payment overdue',
      message: `${label} of PHP ${peso} is overdue (due ${new Date(
        dueDate,
      ).toLocaleDateString('en-PH')}).`,
      link: '/payments',
      entity: 'FinancialObligation',
    });
  },

  async accountStatusChanged({ userId, status, actorName }) {
    return notifyUser({
      userId,
      type: 'ACCOUNT_STATUS',
      title: 'Account status updated',
      message: `Your account status is now ${status}. Changed by ${actorName}.`,
      link: '/profile',
      entity: 'User',
    });
  },

  // ------------------------- read-side helpers ---------------------------

  async unreadCount(userId) {
    if (!userId) return 0;
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  async list(userId, { take = 20, skip = 0, unreadOnly = false } = {}) {
    return prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  },

  async markRead(userId, ids) {
    const result = await prisma.notification.updateMany({
      where: { userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  },

  async markAllRead(userId) {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  },
};
