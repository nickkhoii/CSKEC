'use server';

import { revalidatePath } from 'next/cache';
import { meetingAttendance } from '@/lib/meeting-attendance';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { PERMISSIONS } from '@/lib/rbac';
import { requireUserApi, can } from '@/lib/session';
import { notifications } from '@/lib/notifications';
import { appointOfficer, endOfficerTerm } from '@/lib/officers';
import { slugify } from '@/lib/utils';
import {
  activitySchema,
  endOfficerTermSchema,
  meetingSchema,
  minuteSchema,
  noticeSchema,
  officerAssignmentSchema,
  postSchema,
  updateActivitySchema,
  updateNoticeSchema,
  updatePostSchema,
  updateMeetingSchema,
} from '@/validations/schemas';
import { fromZod, ok, runAction, str } from './helpers';

/**
 * ---------------------------------------------------------------------------
 * Club content actions (Secretary module)
 * ---------------------------------------------------------------------------
 * Posts, activities, notices, meetings, minutes and officer assignments.
 *
 * Nothing here is ever hard-deleted: publishing, archiving and ending a term are
 * status changes so the historical record stays intact.
 */

const denied = (what) => ({ success: false, message: `You do not have permission to ${what}.` });

/** Ensures a slug is unique by appending a short deterministic suffix. */
async function uniqueSlug(title, currentId = null) {
  const base = slugify(title);
  const existing = await prisma.post.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing || existing.id === currentId) return base;
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createPostAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.POST_MANAGE))) return denied('manage club updates');

  const parsed = postSchema.safeParse({
    title: str(formData, 'title'),
    category: str(formData, 'category'),
    excerpt: str(formData, 'excerpt'),
    content: str(formData, 'content'),
    eventDate: str(formData, 'eventDate'),
    startTime: str(formData, 'startTime'),
    endTime: str(formData, 'endTime'),
    venue: str(formData, 'venue'),
    isPinned: str(formData, 'isPinned'),
    status: str(formData, 'status') ?? 'DRAFT',
    activityId: str(formData, 'activityId'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    const post = await prisma.post.create({
      data: {
        title: data.title,
        slug: await uniqueSlug(data.title),
        category: data.category,
        excerpt: data.excerpt,
        content: data.content,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        startTime: data.startTime,
        endTime: data.endTime,
        venue: data.venue,
        isPinned: data.isPinned,
        status: data.status,
        activityId: data.activityId,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await audit({
      category: 'CONTENT',
      action: 'POST_CREATED',
      entity: 'Post',
      entityId: post.id,
      description: `${user.name} created the ${data.status.toLowerCase()} update "${post.title}".`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { category: post.category, status: post.status },
    });

    if (post.status === 'PUBLISHED') {
      await notifications.announcementPublished({
        postId: post.id,
        title: post.title,
        categoryLabel: data.category,
      });
    }

    revalidatePath('/secretary/posts');
    revalidatePath('/updates');
    return ok({ id: post.id, slug: post.slug }, 'Club update saved.');
  });
}

export async function updatePostAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.POST_MANAGE))) return denied('manage club updates');

  const parsed = updatePostSchema.safeParse({
    id: str(formData, 'id'),
    title: str(formData, 'title'),
    category: str(formData, 'category'),
    excerpt: str(formData, 'excerpt'),
    content: str(formData, 'content'),
    eventDate: str(formData, 'eventDate'),
    startTime: str(formData, 'startTime'),
    endTime: str(formData, 'endTime'),
    venue: str(formData, 'venue'),
    isPinned: str(formData, 'isPinned'),
    status: str(formData, 'status') ?? 'DRAFT',
    activityId: str(formData, 'activityId'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    const before = await prisma.post.findUnique({
      where: { id: data.id },
      select: { id: true, title: true, status: true, category: true },
    });
    if (!before) return { success: false, message: 'That update no longer exists.' };

    const post = await prisma.post.update({
      where: { id: data.id },
      data: {
        title: data.title,
        slug: await uniqueSlug(data.title, data.id),
        category: data.category,
        excerpt: data.excerpt,
        content: data.content,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        startTime: data.startTime,
        endTime: data.endTime,
        venue: data.venue,
        isPinned: data.isPinned,
        status: data.status,
        activityId: data.activityId,
        publishedAt:
          data.status === 'PUBLISHED' ? (before.status === 'PUBLISHED' ? undefined : new Date()) : null,
        archivedAt: data.status === 'ARCHIVED' ? new Date() : null,
        updatedById: user.id,
      },
    });

    await audit({
      category: 'CONTENT',
      action: before.status !== data.status ? `POST_${data.status}` : 'POST_UPDATED',
      entity: 'Post',
      entityId: post.id,
      description: `${user.name} updated "${post.title}" (${before.status} -> ${data.status}).`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { from: before.status, to: data.status },
    });

    if (data.status === 'PUBLISHED' && before.status !== 'PUBLISHED') {
      await notifications.announcementPublished({
        postId: post.id,
        title: post.title,
        categoryLabel: data.category,
      });
    }

    revalidatePath('/secretary/posts');
    revalidatePath(`/updates/${post.id}`);
    revalidatePath('/updates');
    return ok({ id: post.id }, 'Club update saved.');
  });
}

export async function setPostStatusAction(postId, status) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.POST_MANAGE))) return denied('manage club updates');
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return { success: false, message: 'Invalid publication status.' };
  }
  // Publishing is a distinct privilege from editing.
  if (status === 'PUBLISHED' && !(await can(PERMISSIONS.POST_PUBLISH))) {
    return denied('publish club updates');
  }

  return runAction(async () => {
    const post = await prisma.post.update({
      where: { id: postId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        archivedAt: status === 'ARCHIVED' ? new Date() : null,
        updatedById: user.id,
      },
      select: { id: true, title: true, category: true },
    });

    await audit({
      category: 'CONTENT',
      action: `POST_${status}`,
      entity: 'Post',
      entityId: postId,
      description: `${user.name} set "${post.title}" to ${status}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { status },
    });

    if (status === 'PUBLISHED') {
      await notifications.announcementPublished({
        postId,
        title: post.title,
        categoryLabel: post.category,
      });
    }

    revalidatePath('/secretary/posts');
    revalidatePath('/updates');
    return ok(null, `Update ${status.toLowerCase()}.`);
  });
}

export async function createNoticeAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.NOTICE_MANAGE))) return denied('manage notices');

  const parsed = noticeSchema.safeParse({
    title: str(formData, 'title'),
    content: str(formData, 'content'),
    noticeDate: str(formData, 'noticeDate'),
    expiryDate: str(formData, 'expiryDate'),
    priority: str(formData, 'priority') ?? 'NORMAL',
    audience: str(formData, 'audience') ?? 'ALL_MEMBERS',
    status: str(formData, 'status') ?? 'DRAFT',
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    const notice = await prisma.notice.create({
      data: {
        title: data.title,
        content: data.content,
        noticeDate: new Date(data.noticeDate),
        // `optionalDateField` yields a "YYYY-MM-DD" string; the column is a
        // `@db.Date`, and Prisma rejects a bare date string, so convert it here.
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        priority: data.priority,
        audience: data.audience,
        status: data.status,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
        createdById: user.id,
      },
    });

    await audit({
      category: 'CONTENT',
      action: 'NOTICE_CREATED',
      entity: 'Notice',
      entityId: notice.id,
      description: `${user.name} created notice "${notice.title}" (${data.status}).`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { priority: notice.priority, audience: notice.audience },
    });

    if (notice.status === 'PUBLISHED') {
      await notifications.noticePublished({
        noticeId: notice.id,
        title: notice.title,
        priority: notice.priority,
        audienceLabel: data.audience,
      });
    }

    revalidatePath('/secretary/notices');
    revalidatePath('/notices');
    return ok({ id: notice.id }, 'Notice saved.');
  });
}

export async function updateNoticeAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.NOTICE_MANAGE))) return denied('manage notices');

  const parsed = updateNoticeSchema.safeParse({
    id: str(formData, 'id'),
    title: str(formData, 'title'),
    content: str(formData, 'content'),
    noticeDate: str(formData, 'noticeDate'),
    expiryDate: str(formData, 'expiryDate'),
    priority: str(formData, 'priority') ?? 'NORMAL',
    audience: str(formData, 'audience') ?? 'ALL_MEMBERS',
    status: str(formData, 'status') ?? 'DRAFT',
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    const before = await prisma.notice.findUnique({
      where: { id: data.id },
      select: { id: true, status: true, priority: true },
    });
    if (!before) return { success: false, message: 'That notice no longer exists.' };

    const notice = await prisma.notice.update({
      where: { id: data.id },
      data: {
        title: data.title,
        content: data.content,
        noticeDate: new Date(data.noticeDate),
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        priority: data.priority,
        audience: data.audience,
        status: data.status,
        publishedAt:
          data.status === 'PUBLISHED' ? (before.status === 'PUBLISHED' ? undefined : new Date()) : null,
        archivedAt: data.status === 'ARCHIVED' ? new Date() : null,
      },
    });

    await audit({
      category: 'CONTENT',
      action: before.status !== data.status ? `NOTICE_${data.status}` : 'NOTICE_UPDATED',
      entity: 'Notice',
      entityId: notice.id,
      description: `${user.name} updated notice "${notice.title}" (${before.status} -> ${data.status}).`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { from: before.status, to: data.status },
    });

    if (data.status === 'PUBLISHED' && before.status !== 'PUBLISHED') {
      await notifications.noticePublished({
        noticeId: notice.id,
        title: notice.title,
        priority: notice.priority,
        audienceLabel: data.audience,
      });
    }

    revalidatePath('/secretary/notices');
    revalidatePath('/notices');
    return ok({ id: notice.id }, 'Notice saved.');
  });
}

export async function setNoticeStatusAction(noticeId, status) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.NOTICE_MANAGE))) return denied('manage notices');
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return { success: false, message: 'Invalid publication status.' };
  }

  return runAction(async () => {
    const notice = await prisma.notice.update({
      where: { id: noticeId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        archivedAt: status === 'ARCHIVED' ? new Date() : null,
      },
      select: { id: true, title: true, priority: true, audience: true },
    });

    await audit({
      category: 'CONTENT',
      action: `NOTICE_${status}`,
      entity: 'Notice',
      entityId: noticeId,
      description: `${user.name} set notice "${notice.title}" to ${status}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { status },
    });

    if (status === 'PUBLISHED') {
      await notifications.noticePublished({
        noticeId,
        title: notice.title,
        priority: notice.priority,
        audienceLabel: notice.audience,
      });
    }

    revalidatePath('/secretary/notices');
    revalidatePath('/notices');
    return ok(null, `Notice ${status.toLowerCase()}.`);
  });
}

export async function createActivityAction(_prevState, formData) { return saveActivity(formData, false); }
export async function updateActivityAction(_prevState, formData) { return saveActivity(formData, true); }
async function saveActivity(formData, editing) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.ACTIVITY_MANAGE))) return denied('manage activities');

  const parsed = (editing ? updateActivitySchema : activitySchema).safeParse({
    id: str(formData, 'id'),
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    type: str(formData, 'type'),
    category: str(formData, 'category'),
    startsAt: str(formData, 'startsAt'),
    endsAt: str(formData, 'endsAt'),
    venue: str(formData, 'venue'),
    address: str(formData, 'address'),
    requiresAttendance: formData?.get('requiresAttendance') ?? false,
    creditsHours: str(formData, 'creditsHours'),
    feeAmount: str(formData, 'feeAmount'),
    capacity: str(formData, 'capacity'),
    status: str(formData, 'status') ?? 'DRAFT',
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    const activity = await prisma.activity[editing ? 'update' : 'create']({
      ...(editing ? { where: { id: data.id } } : {}),
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        category: data.category,
        startsAt: data.startsAt,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        venue: data.venue,
        address: data.address,
        requiresAttendance: data.requiresAttendance,
        creditsHours: data.creditsHours,
        feeAmount: data.feeAmount,
        capacity: data.capacity,
        status: data.status,
        publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
        ...(editing ? {} : { createdById: user.id }),
      },
    });

    await audit({
      category: 'CONTENT',
      action: editing ? 'ACTIVITY_UPDATED' : 'ACTIVITY_CREATED',
      entity: 'Activity',
      entityId: activity.id,
      description: `${user.name} created activity "${activity.title}".`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { type: activity.type, status: activity.status },
    });

    if (activity.status === 'PUBLISHED') {
      await notifications.eventScheduled({
        activityId: activity.id,
        title: activity.title,
        venue: activity.venue,
      });
    }

    revalidatePath('/secretary/activities');
    revalidatePath('/attendance');
    return ok({ id: activity.id }, 'Activity saved.');
  });
}

export async function setActivityStatusAction(activityId, status) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.ACTIVITY_MANAGE))) return denied('manage activities');
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return { success: false, message: 'Invalid publication status.' };
  }

  return runAction(async () => {
    const activity = await prisma.activity.update({
      where: { id: activityId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        archivedAt: status === 'ARCHIVED' ? new Date() : null,
      },
      select: { id: true, title: true, venue: true },
    });

    await audit({
      category: 'CONTENT',
      action: `ACTIVITY_${status}`,
      entity: 'Activity',
      entityId: activityId,
      description: `${user.name} set activity "${activity.title}" to ${status}.`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { status },
    });

    if (status === 'PUBLISHED') {
      await notifications.eventScheduled({
        activityId,
        title: activity.title,
        venue: activity.venue,
      });
    }

    revalidatePath('/secretary/activities');
    revalidatePath('/attendance');
    return ok(null, `Activity ${status.toLowerCase()}.`);
  });
}

export async function createMeetingAction(_prevState, formData) { return saveMeeting(formData, false); }
export async function updateMeetingAction(_prevState, formData) { return saveMeeting(formData, true); }
async function saveMeeting(formData, editing) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.MEETING_MANAGE))) return denied('manage meetings');

  const parsed = (editing ? updateMeetingSchema : meetingSchema).safeParse({
    id: str(formData, 'id'),
    title: str(formData, 'title'),
    meetingType: str(formData, 'meetingType'),
    meetingDate: str(formData, 'meetingDate'),
    startTime: str(formData, 'startTime'),
    endTime: str(formData, 'endTime'),
    venue: str(formData, 'venue'),
    description: str(formData, 'description'),
    presidingOfficerId: str(formData, 'presidingOfficerId'),
    activityId: str(formData, 'activityId'),
    status: str(formData, 'status') ?? 'SCHEDULED',
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  return runAction(async () => {
    if (data.activityId) {
      const activity = await prisma.activity.findUnique({
        where: { id: data.activityId }, select: { requiresAttendance: true },
      });
      if (!activity?.requiresAttendance) {
        return { success: false, message: 'Select an existing attendance-tracked activity for this meeting.' };
      }
    }
    const meeting = await prisma.meeting[editing ? 'update' : 'create']({
      ...(editing ? { where: { id: data.id } } : {}),
      data: {
        title: data.title,
        meetingType: data.meetingType,
        meetingDate: new Date(data.meetingDate),
        startTime: data.startTime,
        endTime: data.endTime,
        venue: data.venue,
        description: data.description,
        presidingOfficerId: data.presidingOfficerId,
        activityId: data.activityId,
        status: data.status,
        ...(editing ? {} : { createdById: user.id }),
      },
    });

    await audit({
      category: 'CONTENT',
      action: editing ? 'MEETING_UPDATED' : 'MEETING_CREATED',
      entity: 'Meeting',
      entityId: meeting.id,
      description: `${user.name} scheduled the meeting "${meeting.title}".`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { meetingType: meeting.meetingType, status: meeting.status },
    });

    revalidatePath('/secretary/meetings');
    revalidatePath('/meetings');
    revalidatePath(`/meetings/${meeting.id}`);
    return ok({ id: meeting.id }, 'Meeting scheduled.');
  });
}

export async function getMinuteAttendanceAction(meetingId) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.MINUTE_MANAGE))) return denied('manage meeting minutes');
  const parsed = minuteSchema.shape.meetingId.safeParse(meetingId);
  if (!parsed.success) return fromZod(parsed.error);
  return runAction(async () => {
    const attendance = await meetingAttendance(parsed.data);
    if (!attendance) return { success: false, message: 'That meeting does not exist.' };
    return ok(attendance);
  });
}

export async function saveMinuteAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.MINUTE_MANAGE))) return denied('manage meeting minutes');

  const parsed = minuteSchema.safeParse({
    meetingId: str(formData, 'meetingId'),
    title: str(formData, 'title'),
    summary: str(formData, 'summary'),
    agenda: str(formData, 'agenda'),
    discussion: str(formData, 'discussion'),
    resolutions: str(formData, 'resolutions'),
    actionItems: str(formData, 'actionItems'),
    status: str(formData, 'status') ?? 'DRAFT',
  });
  if (!parsed.success) return fromZod(parsed.error);

  const data = parsed.data;

  // Only a user holding minute:approve may mark minutes as APPROVED.
  if (data.status === 'APPROVED' && !(await can(PERMISSIONS.MINUTE_APPROVE))) {
    return denied('approve meeting minutes');
  }

  return runAction(async () => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: data.meetingId },
      select: { id: true, title: true },
    });
    if (!meeting) return { success: false, message: 'That meeting does not exist.' };

    const existing = await prisma.meetingMinute.findUnique({
      where: { meetingId: data.meetingId },
      select: { id: true, status: true },
    });

    const payload = {
      title: data.title,
      summary: data.summary,
      agenda: data.agenda,
      discussion: data.discussion,
      resolutions: data.resolutions,
      actionItems: data.actionItems,
      status: data.status,
      preparedById: user.id,
      preparedByName: user.name,
      ...(data.status === 'APPROVED'
        ? { approvedById: user.id, approvedByName: user.name, approvedAt: new Date() }
        : {}),
    };

    const minute = existing
      ? await prisma.meetingMinute.update({ where: { id: existing.id }, data: payload })
      : await prisma.meetingMinute.create({ data: { meetingId: data.meetingId, ...payload } });

    // A meeting whose minutes are approved is by definition completed.
    if (data.status === 'APPROVED') {
      await prisma.meeting.updateMany({
        where: { id: data.meetingId, status: 'SCHEDULED' },
        data: { status: 'COMPLETED' },
      });
    }

    await audit({
      category: 'CONTENT',
      action: existing ? 'MINUTE_MODIFIED' : 'MINUTE_CREATED',
      entity: 'MeetingMinute',
      entityId: minute.id,
      description: `${user.name} saved minutes for "${meeting.title}" (${data.status}).`,
      user: { id: user.id, email: user.email, role: user.role },
      metadata: { status: data.status, meetingId: data.meetingId },
    });

    revalidatePath('/secretary/meetings');
    revalidatePath(`/meetings/${data.meetingId}`);
    return ok({ id: minute.id }, 'Meeting minutes saved.');
  });
}

export async function appointOfficerAction(_prevState, formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.OFFICER_MANAGE))) return denied('manage officer records');

  const parsed = officerAssignmentSchema.safeParse({
    memberId: str(formData, 'memberId'),
    positionId: str(formData, 'positionId'),
    termStart: str(formData, 'termStart'),
    termEnd: str(formData, 'termEnd'),
    notes: str(formData, 'notes'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(
    async () => {
      const assignment = await appointOfficer({
        memberId: parsed.data.memberId,
        positionId: parsed.data.positionId,
        termStart: parsed.data.termStart,
        termEnd: parsed.data.termEnd,
        notes: parsed.data.notes,
        appointedById: user.id,
      });

      await audit({
        category: 'OFFICER',
        action: 'OFFICER_APPOINTED',
        entity: 'OfficerAssignment',
        entityId: assignment.id,
        description: `${user.name} appointed a member to ${assignment.position.name}.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: {
          position: assignment.position.code,
          memberId: assignment.memberId,
          termStart: assignment.termStart,
        },
      });

      revalidatePath('/secretary/officers');
      revalidatePath('/president/officers');
      revalidatePath('/officers');
      return ok({ id: assignment.id }, 'Officer assignment saved.');
    },
    { silent: true },
  );
}

/**
 * Ends an officer term. The assignment row is kept (status -> ENDED) so the
 * club's officer history stays complete and printable.
 */
export async function endOfficerTermAction(formData) {
  const user = await requireUserApi();
  if (!user) return { success: false, message: 'Session expired.' };
  if (!(await can(PERMISSIONS.OFFICER_MANAGE))) return denied('manage officer records');

  const parsed = endOfficerTermSchema.safeParse({
    assignmentId: str(formData, 'assignmentId'),
    termEnd: str(formData, 'termEnd'),
    notes: str(formData, 'notes'),
  });
  if (!parsed.success) return fromZod(parsed.error);

  return runAction(
    async () => {
      const assignment = await endOfficerTerm({
        assignmentId: parsed.data.assignmentId,
        termEnd: parsed.data.termEnd,
        notes: parsed.data.notes,
      });

      await audit({
        category: 'OFFICER',
        action: 'OFFICER_TERM_ENDED',
        entity: 'OfficerAssignment',
        entityId: assignment.id,
        description: `${user.name} ended an officer term on ${parsed.data.termEnd}. The historical record was retained.`,
        user: { id: user.id, email: user.email, role: user.role },
        metadata: { termEnd: parsed.data.termEnd },
      });

      revalidatePath('/secretary/officers');
      revalidatePath('/president/officers');
      revalidatePath('/officers');
      return ok(null, 'Officer term ended. The historical record was retained.');
    },
    { silent: true },
  );
}
