import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ACTIVITY_TYPES,
  MEETING_TYPES,
  NOTICE_AUDIENCES,
  NOTICE_PRIORITIES,
  OBLIGATION_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  POST_CATEGORIES,
  PUBLICATION_STATUSES,
  ROLE_LIST,
  TRANSACTION_TYPES,
} from '@/lib/constants';
import {
  cuidField,
  dateField,
  dateTimeField,
  emailField,
  moneyField,
  monthField,
  optionalDateField,
  optionalDateTimeField,
  optionalText,
  passwordField,
  requiredText,
  yearField,
} from './common';

/**
 * Zod rejects `required_error` / `invalid_type_error` alongside a custom
 * `errorMap`, so the single map below covers both the missing and the invalid
 * case with the same friendly message.
 */
const enumOf = (values, label) =>
  z.enum(values, {
    errorMap: () => ({ message: `Select a valid ${label}.` }),
  });

const optionalEnum = (values) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) =>
      value === '' || value === null || value === undefined ? null : value,
    )
    .refine((value) => value === null || values.includes(value), {
      message: 'Select a valid option.',
    });

/** `true` for checkboxes, which post as "on" rather than a boolean. */
const checkbox = () =>
  z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === 'true' || value === 'on')
    .default(false);

const today = () => new Date().toISOString().slice(0, 10);

// ============================== AUTH =======================================

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.').max(200),
  callbackUrl: optionalText('Redirect', { max: 200 }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: passwordField('New password'),
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from your current password.',
  });

// ============================== MEMBERS ===================================

const memberProfileShape = {
  firstName: requiredText('First name', { max: 80 }),
  middleName: optionalText('Middle name', { max: 80 }),
  lastName: requiredText('Last name', { max: 80 }),
  suffix: optionalText('Suffix', { max: 10 }),
  email: emailField,
  contactNumber: optionalText('Contact number', { max: 30 }),
  address: optionalText('Address', { max: 300 }),
  birthday: optionalDateField('Birthday'),
  dateJoined: dateField('Date joined'),
  bloodType: optionalText('Blood type', { max: 5 }),
  emergencyName: optionalText('Emergency contact name', { max: 120 }),
  emergencyPhone: optionalText('Emergency contact number', { max: 30 }),
  notes: optionalText('Notes', { max: 2000 }),
};

export const createMemberSchema = z.object({
  ...memberProfileShape,
  memberNumber: optionalText('Member ID', { max: 40 }),
  status: enumOf(['ACTIVE', 'INACTIVE', 'EXPUNGED'], 'membership status').default('ACTIVE'),
  createAccount: checkbox(),
  accountPassword: optionalText('Initial password', { max: 200 }),
  role: optionalEnum(ROLE_LIST),
});

export const updateMemberSchema = z.object({
  id: cuidField('Member'),
  ...memberProfileShape,
  status: enumOf(['ACTIVE', 'INACTIVE', 'EXPUNGED'], 'membership status'),
});

export const memberSearchSchema = z.object({
  q: optionalText('Search', { max: 120 }),
  status: optionalEnum(['ACTIVE', 'INACTIVE', 'EXPUNGED']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

// ============================== POSTS / ACTIVITIES =========================

export const postSchema = z.object({
  title: requiredText('Title', { max: 200 }),
  category: enumOf(POST_CATEGORIES, 'category'),
  excerpt: optionalText('Excerpt', { max: 300 }),
  content: requiredText('Content', { min: 10, max: 20000 }),
  eventDate: optionalDateField('Event date'),
  startTime: optionalText('Start time', { max: 20 }),
  endTime: optionalText('End time', { max: 20 }),
  venue: optionalText('Venue', { max: 200 }),
  isPinned: checkbox(),
  status: enumOf(PUBLICATION_STATUSES, 'publication status').default('DRAFT'),
  activityId: optionalText('Activity', { max: 40 }),
});

export const updatePostSchema = postSchema.extend({ id: cuidField('Post') });

const optionalNumberish = (label) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) =>
      value === '' || value === null || value === undefined ? null : String(value),
    )
    .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), {
      message: `${label} must be a number with at most 2 decimal places.`,
    });

/**
 * Base object schema for an activity.
 *
 * NOTE: it is kept separate from the exported schemas because `.refine()`
 * returns a ZodEffects, which has no `.extend()`. Both the create and the
 * update schema therefore extend THIS object and then apply the same
 * cross-field rule, so the two can never drift apart.
 */
const activityBaseShape = {
  title: requiredText('Title', { max: 200 }),
  description: optionalText('Description', { max: 5000 }),
  type: enumOf(ACTIVITY_TYPES, 'activity type'),
  category: enumOf(POST_CATEGORIES, 'category'),
  startsAt: dateTimeField('Start'),
  endsAt: optionalDateTimeField('End'),
  venue: optionalText('Venue', { max: 200 }),
  address: optionalText('Address', { max: 300 }),
  requiresAttendance: z
    .union([z.boolean(), z.string()])
    .transform((v) => v !== false && v !== 'false' && v !== 'off')
    .default(true),
  creditsHours: optionalNumberish('Community service hours'),
  feeAmount: optionalNumberish('Fee amount'),
  capacity: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v < 100000), {
      message: 'Capacity must be a positive whole number.',
    }),
  status: enumOf(PUBLICATION_STATUSES, 'publication status').default('DRAFT'),
};

/** An activity cannot end before it starts. */
const activityTimeRule = (data) => !data.endsAt || new Date(data.endsAt) > new Date(data.startsAt);

export const activitySchema = z
  .object(activityBaseShape)
  .refine(activityTimeRule, {
    path: ['endsAt'],
    message: 'The end time must be after the start time.',
  });

export const updateActivitySchema = z
  .object({ ...activityBaseShape, id: cuidField('Activity') })
  .refine(activityTimeRule, {
    path: ['endsAt'],
    message: 'The end time must be after the start time.',
  });

// ============================== NOTICES ====================================

export const noticeSchema = z.object({
  title: requiredText('Title', { max: 200 }),
  content: requiredText('Content', { min: 5, max: 10000 }),
  noticeDate: dateField('Notice date'),
  priority: enumOf(NOTICE_PRIORITIES, 'priority').default('NORMAL'),
  audience: enumOf(NOTICE_AUDIENCES, 'audience').default('ALL_MEMBERS'),
  status: enumOf(PUBLICATION_STATUSES, 'publication status').default('DRAFT'),
});

export const updateNoticeSchema = noticeSchema.extend({ id: cuidField('Notice') });

// ============================== MEETINGS / MINUTES ========================

export const meetingSchema = z.object({
  title: requiredText('Title', { max: 200 }),
  meetingType: enumOf(MEETING_TYPES, 'meeting type'),
  meetingDate: dateField('Meeting date'),
  startTime: requiredText('Start time', { max: 20 }),
  endTime: optionalText('End time', { max: 20 }),
  venue: optionalText('Venue', { max: 200 }),
  description: optionalText('Description', { max: 5000 }),
  presidingOfficerId: optionalText('Presiding officer', { max: 40 }),
  activityId: optionalText('Activity', { max: 40 }),
  status: enumOf(['SCHEDULED', 'COMPLETED', 'CANCELLED'], 'meeting status').default('SCHEDULED'),
});

export const minuteSchema = z.object({
  meetingId: cuidField('Meeting'),
  title: requiredText('Title', { max: 200 }),
  summary: optionalText('Summary', { max: 10000 }),
  agenda: optionalText('Agenda', { max: 10000 }),
  discussion: optionalText('Discussion', { max: 20000 }),
  resolutions: optionalText('Resolutions', { max: 20000 }),
  actionItems: optionalText('Action items', { max: 20000 }),
  status: enumOf(['DRAFT', 'SUBMITTED', 'APPROVED'], 'minutes status').default('DRAFT'),
});

// ============================== OFFICERS ===================================

export const officerAssignmentSchema = z
  .object({
    memberId: cuidField('Member'),
    positionId: cuidField('Position'),
    termStart: dateField('Term start'),
    termEnd: optionalDateField('Term end'),
    notes: optionalText('Notes', { max: 1000 }),
  })
  .refine((data) => !data.termEnd || data.termEnd >= data.termStart, {
    path: ['termEnd'],
    message: 'The term end must be on or after the term start.',
  });

export const endOfficerTermSchema = z.object({
  assignmentId: cuidField('Assignment'),
  termEnd: dateField('Term end'),
  notes: optionalText('Notes', { max: 1000 }),
});

// ============================== ATTENDANCE =================================

export const attendanceRequestSchema = z.object({
  activityId: cuidField('Activity'),
  remarks: optionalText('Remarks', { max: 1000 }),
});

export const attendanceReviewSchema = z.object({
  requestId: cuidField('Attendance request'),
  decision: enumOf(['APPROVE', 'REJECT'], 'decision'),
  remarks: optionalText('Remarks', { max: 1000 }),
  recordStatus: enumOf(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'], 'attendance status'),
});

export const manualAttendanceSchema = z.object({
  activityId: cuidField('Activity'),
  memberIds: z.array(cuidField('Member')).min(1, 'Select at least one member.').max(500),
  recordStatus: enumOf(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'], 'attendance status'),
  remarks: optionalText('Remarks', { max: 1000 }),
});

// ============================== FINANCE ====================================

export const paymentSubmissionSchema = z
  .object({
    obligationId: optionalText('Obligation', { max: 40 }),
    type: enumOf(OBLIGATION_TYPES, 'payment type'),
    periodMonth: z.union([z.literal(''), monthField]).optional(),
    periodYear: z.union([z.literal(''), yearField]).optional(),
    amount: moneyField('Amount'),
    paymentDate: dateField('Payment date'),
    referenceNumber: requiredText('Reference number', { min: 3, max: 80 }),
    paymentMethod: enumOf(PAYMENT_METHODS, 'payment method'),
    notes: optionalText('Notes', { max: 1000 }),
  })
  .refine((data) => data.paymentDate <= today(), {
    path: ['paymentDate'],
    message: 'The payment date cannot be in the future.',
  })
  .refine((data) => Boolean(data.periodMonth) === Boolean(data.periodYear), {
    path: ['periodYear'],
    message: 'Provide both the month and the year for the billing period.',
  })
  .refine((data) => data.type !== 'MONTHLY_DUES' || Boolean(data.obligationId), {
    path: ['obligationId'],
    message: 'Select the monthly dues you are paying.',
  });

export const paymentReviewSchema = z.object({
  submissionId: cuidField('Payment submission'),
  decision: enumOf(['APPROVE', 'REJECT'], 'decision'),
  remarks: optionalText('Reviewer remarks', { max: 1000 }),
  obligationId: optionalText('Obligation', { max: 40 }),
});

export const manualPaymentSchema = z
  .object({
    memberId: cuidField('Member'),
    obligationId: optionalText('Obligation', { max: 40 }),
    amount: moneyField('Amount'),
    paymentDate: dateField('Payment date'),
    referenceNumber: requiredText('Reference number', { min: 3, max: 80 }),
    paymentMethod: enumOf(PAYMENT_METHODS, 'payment method'),
    remarks: optionalText('Remarks', { max: 1000 }),
  })
  .refine((data) => data.paymentDate <= today(), {
    path: ['paymentDate'],
    message: 'The payment date cannot be in the future.',
  });

export const generateDuesSchema = z
  .object({
    periodMonth: monthField,
    periodYear: yearField,
    amount: moneyField('Dues amount'),
    dueDate: dateField('Due date'),
    scope: enumOf(['ALL', 'SELECTED'], 'scope').default('ALL'),
    memberIds: z.array(cuidField('Member')).default([]),
    note: optionalText('Note', { max: 500 }),
  })
  .refine((data) => data.scope !== 'SELECTED' || data.memberIds.length > 0, {
    path: ['memberIds'],
    message: 'Select at least one member.',
  });

export const obligationSchema = z
  .object({
    memberId: cuidField('Member'),
    type: enumOf(OBLIGATION_TYPES, 'obligation type'),
    title: requiredText('Title', { max: 200 }),
    description: optionalText('Description', { max: 1000 }),
    periodMonth: z.union([z.literal(''), monthField]).optional(),
    periodYear: z.union([z.literal(''), yearField]).optional(),
    amountDue: moneyField('Amount due'),
    dueDate: dateField('Due date'),
    activityId: optionalText('Activity', { max: 40 }),
    notes: optionalText('Notes', { max: 1000 }),
  })
  .refine((data) => Boolean(data.periodMonth) === Boolean(data.periodYear), {
    path: ['periodYear'],
    message: 'Provide both the month and the year for the billing period.',
  });

export const waiveObligationSchema = z.object({
  obligationId: cuidField('Obligation'),
  reason: requiredText('Reason', { min: 5, max: 500 }),
});

export const transactionSchema = z
  .object({
    type: enumOf(TRANSACTION_TYPES, 'transaction type'),
    categoryId: cuidField('Category'),
    transactionDate: dateField('Transaction date'),
    description: requiredText('Description', { min: 3, max: 500 }),
    amount: moneyField('Amount'),
    reference: optionalText('Reference', { max: 100 }),
    memberId: optionalText('Member', { max: 40 }),
  })
  .refine((data) => data.transactionDate <= today(), {
    path: ['transactionDate'],
    message: 'The transaction date cannot be in the future.',
  });

export const voidTransactionSchema = z.object({
  transactionId: cuidField('Transaction'),
  reason: requiredText('Reason', { min: 5, max: 500 }),
});

// ============================== USERS / ADMIN =============================

export const createUserSchema = z.object({
  email: emailField,
  fullName: requiredText('Full name', { max: 120 }),
  role: enumOf(ROLE_LIST, 'role'),
  password: passwordField('Password'),
  status: enumOf(ACCOUNT_STATUSES, 'account status').default('ACTIVE'),
  memberId: optionalText('Linked member', { max: 40 }),
  mustChangePassword: checkbox(),
});

export const updateUserSchema = z.object({
  id: cuidField('User'),
  fullName: requiredText('Full name', { max: 120 }),
  email: emailField,
  role: enumOf(ROLE_LIST, 'role'),
  status: enumOf(ACCOUNT_STATUSES, 'account status'),
  memberId: optionalText('Linked member', { max: 40 }),
});

export const updateUserStatusSchema = z.object({
  userId: cuidField('User'),
  status: enumOf(ACCOUNT_STATUSES, 'account status'),
  reason: optionalText('Reason', { max: 500 }),
});

export const adminResetPasswordSchema = z.object({
  userId: cuidField('User'),
  newPassword: passwordField('New password'),
});

export const updateProfileSchema = z.object({
  contactNumber: optionalText('Contact number', { max: 30 }),
  address: optionalText('Address', { max: 300 }),
  emergencyName: optionalText('Emergency contact', { max: 120 }),
  emergencyPhone: optionalText('Emergency contact number', { max: 30 }),
  birthday: optionalDateField('Birthday'),
  bloodType: optionalText('Blood type', { max: 5 }),
});

// ============================== NOTIFICATIONS / SETTINGS ==================

export const notificationActionSchema = z.object({
  ids: z.array(cuidField('Notification')).min(1).max(200),
});

export const settingUpdateSchema = z.object({
  key: requiredText('Setting key', { max: 80 }),
  value: requiredText('Value', { max: 500 }),
});

// ============================== LIST FILTERS ==============================

/** Standard search / filter / pagination query shared by every list page. */
export const listQuerySchema = z.object({
  q: optionalText('Search', { max: 120 }),
  status: optionalText('Status', { max: 40 }),
  category: optionalText('Category', { max: 40 }),
  month: z.union([z.literal(''), monthField]).optional(),
  year: z.union([z.literal(''), yearField]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export { PAYMENT_STATUSES, optionalEnum, checkbox };