import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { PERMISSIONS, dashboardPathForRole } from '@/lib/rbac';

/**
 * ---------------------------------------------------------------------------
 * Navigation model
 * ---------------------------------------------------------------------------
 * Sections are permission-gated. The sidebar only *hides* what a role cannot
 * reach - the server re-checks every one of these permissions, so editing this
 * list can never widen someone's access.
 */

const SECTIONS = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
    ],
  },
  {
    label: 'Club',
    items: [
      { href: '/updates', label: 'Club Updates', icon: Megaphone, permission: PERMISSIONS.POST_VIEW },
      { href: '/notices', label: 'Notices', icon: Bell, permission: PERMISSIONS.NOTICE_VIEW },
      { href: '/meetings', label: 'Meetings & Minutes', icon: BookOpen, permission: PERMISSIONS.MEETING_VIEW },
      { href: '/officers', label: 'Club Officers', icon: ShieldCheck, permission: PERMISSIONS.OFFICER_VIEW },
    ],
  },
  {
    label: 'My Records',
    items: [
      { href: '/attendance', label: 'Attendance', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_VIEW_SELF },
      { href: '/payments', label: 'Dues & Payments', icon: Wallet, permission: PERMISSIONS.FINANCE_VIEW_OWN },
      { href: '/notifications', label: 'Notifications', icon: Bell, permission: PERMISSIONS.NOTIFICATION_VIEW_OWN },
    ],
  },
  {
    label: 'Secretary',
    matchRole: 'SECRETARY',
    items: [
      { href: '/secretary/members', label: 'Members', icon: Users, permission: PERMISSIONS.MEMBER_MANAGE },
      { href: '/secretary/posts', label: 'Club Updates', icon: FileText, permission: PERMISSIONS.POST_MANAGE },
      { href: '/secretary/activities', label: 'Activities', icon: ClipboardList, permission: PERMISSIONS.ACTIVITY_MANAGE },
      { href: '/secretary/attendance', label: 'Attendance Review', icon: CalendarCheck, permission: PERMISSIONS.ATTENDANCE_REVIEW },
      { href: '/secretary/notices', label: 'Notices', icon: Bell, permission: PERMISSIONS.NOTICE_MANAGE },
      { href: '/secretary/meetings', label: 'Meeting Minutes', icon: BookOpen, permission: PERMISSIONS.MINUTE_MANAGE },
      { href: '/secretary/officers', label: 'Officers', icon: ShieldCheck, permission: PERMISSIONS.OFFICER_MANAGE },
      { href: '/reports/member-master', label: 'Reports', icon: FileSpreadsheet, permission: PERMISSIONS.REPORT_MEMBER_MASTER },
    ],
  },
  {
    label: 'Treasurer',
    matchRole: 'TREASURER',
    items: [
      { href: '/treasurer/payments', label: 'Payment Verification', icon: Receipt, permission: PERMISSIONS.FINANCE_REVIEW_PAYMENT },
      { href: '/treasurer/dues', label: 'Monthly Dues', icon: Wallet, permission: PERMISSIONS.FINANCE_MANAGE_DUES },
      { href: '/treasurer/obligations', label: 'Obligations', icon: ClipboardList, permission: PERMISSIONS.FINANCE_MANAGE_OBLIGATIONS },
      { href: '/treasurer/transactions', label: 'Transactions', icon: FileSpreadsheet, permission: PERMISSIONS.FINANCE_MANAGE_TRANSACTIONS },
      { href: '/treasurer/delinquent', label: 'Delinquent Accounts', icon: BarChart3, permission: PERMISSIONS.FINANCE_VIEW_REPORTS },
      { href: '/reports/cash-flow', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.FINANCE_VIEW_REPORTS },
    ],
  },
  {
    label: 'President',
    matchRole: 'PRESIDENT',
    items: [
      { href: '/president/officers', label: 'Officer Assignments', icon: ShieldCheck, permission: PERMISSIONS.OFFICER_MANAGE },
      { href: '/president/overview', label: 'Club Overview', icon: BarChart3, permission: PERMISSIONS.MEMBER_VIEW_ALL },
      { href: '/reports/member-master', label: 'Reports', icon: FileSpreadsheet, permission: PERMISSIONS.REPORT_MEMBER_MASTER },
    ],
  },
  {
    label: 'Administration',
    matchRole: 'SYSTEM_ADMIN',
    items: [
      { href: '/admin/users', label: 'User Accounts', icon: UserCog, permission: PERMISSIONS.USER_MANAGE },
      { href: '/admin/audit', label: 'Audit Logs', icon: Shield, permission: PERMISSIONS.AUDIT_VIEW },
      { href: '/admin/settings', label: 'System Settings', icon: Settings, permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
];

/**
 * Builds the navigation tree for a role.
 * @returns {Array<{ label: string|null, items: Array<{href,label,icon}> }>}
 */
export function buildNavigation(roleKey, canFn) {
  const sections = [];
  for (const section of SECTIONS) {
    if (section.matchRole && section.matchRole !== roleKey) continue;
    const items = (section.items ?? []).filter((item) => canFn(item.permission));
    if (items.length > 0) sections.push({ label: section.label, items });
  }
  return sections;
}

export { SECTIONS };

export function defaultDashboardPath(roleKey) {
  return dashboardPathForRole(roleKey);
}