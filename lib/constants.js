/**
 * Human-readable labels, colours and option lists for every enum in
 * prisma/schema.prisma. The UI never hard-codes these strings inline - keeping
 * them in one place makes the portal consistent and keeps the UI auditable
 * against the database enums.
 */

export const ROLES = {
  MEMBER: 'MEMBER',
  SECRETARY: 'SECRETARY',
  TREASURER: 'TREASURER',
  PRESIDENT: 'PRESIDENT',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
};

export const ROLE_LIST = Object.values(ROLES);

export const ROLE_LABELS = {
  MEMBER: 'Club Member',
  SECRETARY: 'Secretary',
  TREASURER: 'Treasurer',
  PRESIDENT: 'President',
  SYSTEM_ADMIN: 'System Administrator',
};

export const ROLE_DESCRIPTIONS = {
  MEMBER: 'Views club updates, submits attendance requests and pays dues.',
  SECRETARY: 'Manages club updates, notices, minutes, member records and attendance.',
  TREASURER: 'Verifies payments, manages dues, obligations and the financial ledger.',
  PRESIDENT: 'Oversees the club and manages officer assignments.',
  SYSTEM_ADMIN: 'Manages user accounts, roles, system settings and audit logs.',
};

export const ROLE_BADGE = {
  MEMBER: 'bg-navy-100 text-navy-800 ring-navy-200',
  SECRETARY: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  TREASURER: 'bg-amber-100 text-amber-900 ring-amber-200',
  PRESIDENT: 'bg-purple-100 text-purple-800 ring-purple-200',
  SYSTEM_ADMIN: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'DEACTIVATED'];

export const ACCOUNT_STATUS_LABELS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DEACTIVATED: 'Deactivated',
};

export const ACCOUNT_STATUS_BADGE = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  INACTIVE: 'bg-amber-100 text-amber-900 ring-amber-200',
  DEACTIVATED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INACTIVE', 'EXPUNGED'];

export const MEMBERSHIP_STATUS_LABELS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXPUNGED: 'Expunged',
};

export const MEMBERSHIP_STATUS_BADGE = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-700 ring-slate-200',
  EXPUNGED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const POST_CATEGORIES = [
  'GMM',
  'COMMUNITY_SERVICE',
  'NEWS',
  'ACTIVITIES',
  'ANNOUNCEMENT',
];

export const POST_CATEGORY_LABELS = {
  GMM: 'General Membership Meeting',
  COMMUNITY_SERVICE: 'Community Service',
  NEWS: 'News',
  ACTIVITIES: 'Activities',
  ANNOUNCEMENT: 'Announcement',
};

export const POST_CATEGORY_SHORT = {
  GMM: 'GMM',
  COMMUNITY_SERVICE: 'Community Service',
  NEWS: 'News',
  ACTIVITIES: 'Activities',
  ANNOUNCEMENT: 'Announcement',
};

export const POST_CATEGORY_BADGE = {
  GMM: 'bg-navy-100 text-navy-800 ring-navy-200',
  COMMUNITY_SERVICE: 'bg-teal-100 text-teal-800 ring-teal-200',
  NEWS: 'bg-sky-100 text-sky-800 ring-sky-200',
  ACTIVITIES: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  ANNOUNCEMENT: 'bg-gold-100 text-gold-800 ring-gold-200',
};

export const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export const PUBLICATION_STATUS_LABELS = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

export const PUBLICATION_STATUS_BADGE = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ARCHIVED: 'bg-zinc-200 text-zinc-700 ring-zinc-300',
};

export const ACTIVITY_TYPES = [
  'GMM',
  'COMMUNITY_SERVICE',
  'OUTREACH',
  'TRAINING',
  'SOCIAL',
  'OTHER',
];

export const ACTIVITY_TYPE_LABELS = {
  GMM: 'General Membership Meeting',
  COMMUNITY_SERVICE: 'Community Service',
  OUTREACH: 'Outreach',
  TRAINING: 'Training / Seminar',
  SOCIAL: 'Social',
  OTHER: 'Other',
};

export const ATTENDANCE_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const ATTENDANCE_REQUEST_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const ATTENDANCE_REQUEST_STATUS_BADGE = {
  PENDING: 'bg-amber-100 text-amber-900 ring-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const ATTENDANCE_RECORD_STATUSES = ['PRESENT', 'ABSENT', 'EXCUSED', 'LATE'];

export const ATTENDANCE_RECORD_STATUS_LABELS = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
  LATE: 'Late',
};

export const ATTENDANCE_RECORD_STATUS_BADGE = {
  PRESENT: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ABSENT: 'bg-rose-100 text-rose-800 ring-rose-200',
  EXCUSED: 'bg-sky-100 text-sky-800 ring-sky-200',
  LATE: 'bg-amber-100 text-amber-900 ring-amber-200',
};

export const NOTICE_PRIORITIES = ['NORMAL', 'IMPORTANT', 'URGENT'];

export const NOTICE_PRIORITY_LABELS = {
  NORMAL: 'Normal',
  IMPORTANT: 'Important',
  URGENT: 'Urgent',
};

export const NOTICE_PRIORITY_BADGE = {
  NORMAL: 'bg-slate-100 text-slate-700 ring-slate-200',
  IMPORTANT: 'bg-amber-100 text-amber-900 ring-amber-200',
  URGENT: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const NOTICE_AUDIENCES = [
  'ALL_MEMBERS',
  'ALL_OFFICERS',
  'SYSTEM_ADMIN',
  'PRESIDENT',
  'SECRETARY',
  'TREASURER',
];

export const NOTICE_AUDIENCE_LABELS = {
  ALL_MEMBERS: 'All Members',
  ALL_OFFICERS: 'All Officers',
  SYSTEM_ADMIN: 'System Administrator',
  PRESIDENT: 'President',
  SECRETARY: 'Secretary',
  TREASURER: 'Treasurer',
};

export const MEETING_TYPES = [
  'GENERAL_MEMBERSHIP_MEETING',
  'BOARD_MEETING',
  'REGULAR',
  'EMERGENCY',
];

export const MEETING_TYPE_LABELS = {
  GENERAL_MEMBERSHIP_MEETING: 'General Membership Meeting',
  BOARD_MEETING: 'Board Meeting',
  REGULAR: 'Regular Meeting',
  EMERGENCY: 'Emergency Meeting',
};

export const MEETING_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

export const MEETING_STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const MEETING_STATUS_BADGE = {
  SCHEDULED: 'bg-sky-100 text-sky-800 ring-sky-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const MINUTE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED'];

export const MINUTE_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
};

export const MINUTE_STATUS_BADGE = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  SUBMITTED: 'bg-sky-100 text-sky-800 ring-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

export const OBLIGATION_TYPES = ['MONTHLY_DUES', 'COMMUNITY_SERVICE', 'OTHER_FEE'];

export const OBLIGATION_TYPE_LABELS = {
  MONTHLY_DUES: 'Monthly Dues',
  COMMUNITY_SERVICE: 'Community Service',
  OTHER_FEE: 'Other Fee',
};

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING_VERIFICATION',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'WAIVED',
];

export const PAYMENT_STATUS_LABELS = {
  UNPAID: 'Unpaid',
  PENDING_VERIFICATION: 'Pending Verification',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WAIVED: 'Waived',
};

export const PAYMENT_STATUS_BADGE = {
  UNPAID: 'bg-slate-100 text-slate-700 ring-slate-200',
  PENDING_VERIFICATION: 'bg-amber-100 text-amber-900 ring-amber-200',
  PARTIALLY_PAID: 'bg-sky-100 text-sky-800 ring-sky-200',
  PAID: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  OVERDUE: 'bg-rose-100 text-rose-800 ring-rose-200',
  WAIVED: 'bg-zinc-200 text-zinc-700 ring-zinc-300',
};

export const SUBMISSION_STATUSES = [
  'PENDING_VERIFICATION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const SUBMISSION_STATUS_LABELS = {
  PENDING_VERIFICATION: 'Pending Verification',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const SUBMISSION_STATUS_BADGE = {
  PENDING_VERIFICATION: 'bg-amber-100 text-amber-900 ring-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'ONLINE_BANKING',
  'CHECK',
  'GCASH',
  'MAYA',
  'OTHER',
];

export const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  ONLINE_BANKING: 'Online Banking',
  CHECK: 'Check',
  GCASH: 'GCash',
  MAYA: 'Maya',
  OTHER: 'Other',
};

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE'];

export const TRANSACTION_TYPE_LABELS = {
  INCOME: 'Income',
  EXPENSE: 'Expense',
};

export const TRANSACTION_STATUS_LABELS = {
  POSTED: 'Posted',
  VOIDED: 'Voided',
};

export const TRANSACTION_STATUS_BADGE = {
  POSTED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  VOIDED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

export const AUDIT_CATEGORIES = [
  'AUTH',
  'ADMIN',
  'MEMBER',
  'ATTENDANCE',
  'FINANCE',
  'CONTENT',
  'OFFICER',
  'SYSTEM',
];

export const AUDIT_CATEGORY_LABELS = {
  AUTH: 'Authentication',
  ADMIN: 'Administration',
  MEMBER: 'Member Records',
  ATTENDANCE: 'Attendance',
  FINANCE: 'Finance',
  CONTENT: 'Club Content',
  OFFICER: 'Officers',
  SYSTEM: 'System',
};

export const OFFICER_STATUS_LABELS = {
  CURRENT: 'Current',
  ENDED: 'Ended',
  UPCOMING: 'Upcoming',
};

export const OFFICER_STATUS_BADGE = {
  CURRENT: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ENDED: 'bg-slate-100 text-slate-700 ring-slate-200',
  UPCOMING: 'bg-sky-100 text-sky-800 ring-sky-200',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({
  value: index + 1,
  label: name,
}));

export function monthLabel(month) {
  return MONTH_NAMES[month - 1] ?? '';
}

/** Year options centred on the current year (previous 3 years, next 2). */
export function yearOptions(spread = { back: 3, forward: 2 }) {
  const current = new Date().getFullYear();
  const options = [];
  for (let y = current + spread.forward; y >= current - spread.back; y -= 1) {
    options.push({ value: y, label: String(y) });
  }
  return options;
}