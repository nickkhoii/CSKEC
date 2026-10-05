#!/usr/bin/env node
/**
 * Seeds the database with roles, settings, officer positions and transaction
 * categories - and, when SEED_DEMO_DATA=true, a full set of demo accounts and
 * club records for local development.
 *
 * The script is idempotent: everything is upserted on a natural key (email,
 * role key, setting key, category code), so it is safe to re-run.
 *
 * DEMO ACCOUNTS ARE DEVELOPMENT ONLY. They are skipped unless SEED_DEMO_DATA is
 * explicitly enabled, and they are never created against a production-looking
 * database.
 */

const path = require('node:path');
const { loadEnv } = require('../scripts/env-loader');

loadEnv({ requireDatabase: true });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const ROLE_DEFINITIONS = require('../config/roles.json');

const prisma = new PrismaClient();

const SHOULD_SEED_DEMO = ['true', '1', 'yes'].includes(
  String(process.env.SEED_DEMO_DATA ?? '').toLowerCase(),
);
const DEMO_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe!2024';
// Seeding hashes once per account; 10 rounds keeps the seed fast. Runtime logins
// use the stronger cost defined in lib/auth.js.
const BCRYPT_ROUNDS = 10;

const at = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

/** True when the connection string / environment looks like production. */
function looksLikeProduction() {
  const url = process.env.DATABASE_URL ?? '';
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    /neon\.tech\/(?!.*-pooler)/i.test(url) ||
    /supabase|railway|azurehost|amazonaws|rds/i.test(url)
  );
}

async function seedRoles() {
  for (const role of ROLE_DEFINITIONS.roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        priority: role.priority,
        permissions: role.permissions,
        isSystem: true,
      },
      update: {
        name: role.name,
        description: role.description,
        priority: role.priority,
        permissions: role.permissions,
      },
    });
  }
  return ROLE_DEFINITIONS.roles.length;
}

/**
 * Settings defaults are mirrored here in plain JavaScript because the seed runs
 * in CommonJS. Keep in sync with lib/settings.js SETTING_DEFAULTS.
 */
const SETTINGS = [
  ['club.name', 'Centro Sugbo Eagles Club', 'STRING', 'club', 'Club Name',
    'Displayed in the header, reports and printed minutes.'],
  ['club.short_name', 'CSEC', 'STRING', 'club', 'Club Short Name',
    'Short form used in the sidebar and page titles.'],
  ['club.address', 'Centro Sugbo, Cebu, Philippines', 'STRING', 'club', 'Club Address',
    'Club headquarters address shown on printed documents.'],
  ['club.contact', '+63 000 000 0000', 'STRING', 'club', 'Club Contact Number',
    'Contact number printed on official documents.'],
  ['club.email', 'secretary@centrosugboeaglesclub.local', 'STRING', 'club', 'Club Email',
    'Official email address of the club.'],
  ['members.id_prefix', 'CSEC', 'STRING', 'members', 'Member ID Prefix',
    'Prefix for generated member numbers, e.g. CSEC-2024-0001.'],
  ['members.id_sequence', '0', 'NUMBER', 'members', 'Member ID Sequence',
    'Last number issued. The Secretary can reset it if needed.'],
  ['finance.default_dues_amount', '200.00', 'STRING', 'finance', 'Default Monthly Dues',
    'Amount used when generating monthly dues obligations.'],
  ['finance.dues_due_day', '10', 'NUMBER', 'finance', 'Monthly Dues Due Day',
    'Day of the month dues are due (1-28).'],
  ['finance.currency', 'PHP', 'STRING', 'finance', 'Currency',
    'ISO currency code used in reports.'],
  ['finance.opening_balance', '0.00', 'STRING', 'finance', 'Opening Cash Balance',
    'Starting balance used by the cash-flow report.'],
  ['finance.opening_balance_date', '', 'STRING', 'finance', 'Opening Balance Date',
    'Date the opening balance applies (YYYY-MM-DD).'],
  ['attendance.window_days', '7', 'NUMBER', 'attendance', 'Attendance Request Window',
    'Days after an event during which members may still submit PRESENT.'],
  ['attendance.allow_self_record', 'false', 'BOOLEAN', 'attendance',
    'Allow Manual Self-Recording',
    'When true, officers may record their own attendance manually.'],
  ['security.session_hours', String(Number(process.env.SESSION_MAX_AGE_HOURS ?? 8)),
    'NUMBER', 'security', 'Session Lifetime (hours)',
    'Users are signed out automatically after this many hours.'],
  ['security.login_max_attempts', String(Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 5)),
    'NUMBER', 'security', 'Max Failed Logins',
    'Failed attempts before the account is temporarily locked.'],
  ['security.login_lockout_minutes', String(Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15)),
    'NUMBER', 'security', 'Lockout Duration (minutes)',
    'How long an account stays locked after too many failures.'],
];

async function seedSettings() {
  for (const [key, value, valueType, category, label, description] of SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, valueType, category, label, description },
      update: { label, description, category, valueType },
    });
  }
}

const OFFICER_POSITIONS = [
  ['PRESIDENT', 'President', 'Leads the club and presides over meetings.', 1],
  ['VICE_PRESIDENT', 'Vice President', 'Supports the President and acts on their behalf.', 2],
  ['SECRETARY', 'Secretary', 'Keeps records, minutes, notices and attendance.', 3],
  ['TREASURER', 'Treasurer', 'Custodies club funds and keeps the financial records.', 4],
  ['AUDITOR', 'Auditor', 'Reviews financial records for accuracy.', 5],
  ['PIO', 'Public Information Officer', 'Handles club communications and publicity.', 6],
  ['SERGEANT_AT_ARMS', 'Sergeant-at-Arms', 'Maintains order during meetings and activities.', 7],
];

async function seedReferenceData() {
  for (const [code, name, description, sortOrder] of OFFICER_POSITIONS) {
    await prisma.officerPosition.upsert({
      where: { code },
      create: { code, name, description, sortOrder },
      update: { name, description, sortOrder },
    });
  }

  const categories = [
    ['DUES', 'Monthly Dues', 'INCOME', 'Regular monthly membership dues'],
    ['COMMUNITY_SERVICE', 'Community Service Fee', 'INCOME', 'Community service contribution'],
    ['OTHER_FEE', 'Other Club Fee', 'INCOME', 'Other assessed club fees'],
    ['DONATION', 'Donation', 'INCOME', 'Voluntary or solicited donations'],
    ['REFUND', 'Refund / Reversal', 'INCOME', 'Returned or reversed amounts'],
    ['EXPENSE_OPERATIONAL', 'Operational Expense', 'EXPENSE', 'Day-to-day club operations'],
    ['EXPENSE_ACTIVITY', 'Activity Expense', 'EXPENSE', 'Costs directly tied to an activity'],
    ['EXPENSE_EVENT', 'Event / Venue', 'EXPENSE', 'Venue rental, equipment, logistics'],
    ['EXPENSE_OTHER', 'Other Expense', 'EXPENSE', 'Miscellaneous disbursements'],
  ];
  for (const [code, name, type, description] of categories) {
    await prisma.transactionCategory.upsert({
      where: { code },
      create: { code, name, type, description, isSystem: true },
      update: { name, type, description },
    });
  }

  await prisma.fundAccount.upsert({
    where: { code: 'GENERAL' },
    create: {
      code: 'GENERAL',
      name: 'General Fund',
      description: 'Primary club fund used for cash-flow reporting.',
      openingBalance: '0.00',
      openingDate: at('2024-01-01'),
      isActive: true,
    },
    update: { name: 'General Fund' },
  });
}

/**
 * Demo accounts.
 *
 * DEV CREDENTIALS ONLY - every one of these uses the shared password from
 * SEED_DEFAULT_PASSWORD and is created with mustChangePassword=true so a real
 * deployment is forced to change it on first login.
 */
const DEMO_USERS = [
  {
    key: 'SYSTEM_ADMIN',
    email: 'admin@csec.local',
    fullName: 'Ana Dela Cruz',
    member: {
      number: 'CSEC-2024-0001',
      firstName: 'Ana',
      middleName: 'Reyes',
      lastName: 'Dela Cruz',
      contactNumber: '+63 917 000 0001',
      birthday: '1988-04-12',
      joined: '2019-03-15',
    },
  },
  {
    key: 'PRESIDENT',
    email: 'president@csec.local',
    fullName: 'Miguel Santos',
    member: {
      number: 'CSEC-2024-0002',
      firstName: 'Miguel',
      middleName: 'Torres',
      lastName: 'Santos',
      contactNumber: '+63 917 000 0002',
      birthday: '1985-09-02',
      joined: '2017-06-10',
    },
  },
  {
    key: 'SECRETARY',
    email: 'secretary@csec.local',
    fullName: 'Luisa Fernandez',
    member: {
      number: 'CSEC-2024-0003',
      firstName: 'Luisa',
      middleName: 'Ramos',
      lastName: 'Fernandez',
      contactNumber: '+63 917 000 0003',
      birthday: '1990-01-23',
      joined: '2020-08-01',
    },
  },
  {
    key: 'TREASURER',
    email: 'treasurer@csec.local',
    fullName: 'Rafael Bautista',
    member: {
      number: 'CSEC-2024-0004',
      firstName: 'Rafael',
      middleName: 'Cruz',
      lastName: 'Bautista',
      contactNumber: '+63 917 000 0004',
      birthday: '1987-07-30',
      joined: '2018-02-20',
    },
  },
  {
    key: 'MEMBER',
    email: 'member@csec.local',
    fullName: 'Kristine Alonzo',
    member: {
      number: 'CSEC-2024-0005',
      firstName: 'Kristine',
      middleName: 'Lim',
      lastName: 'Alonzo',
      contactNumber: '+63 917 000 0005',
      birthday: '1994-11-05',
      joined: '2022-01-15',
    },
  },
  {
    key: 'MEMBER',
    email: 'member2@csec.local',
    fullName: 'Paolo Reyes',
    member: {
      number: 'CSEC-2024-0006',
      firstName: 'Paolo',
      middleName: 'Garcia',
      lastName: 'Reyes',
      contactNumber: '+63 917 000 0006',
      birthday: '1992-02-18',
      joined: '2023-05-20',
    },
  },
  {
    key: 'MEMBER',
    email: 'member3@csec.local',
    fullName: 'Grace Mercado',
    member: {
      number: 'CSEC-2024-0007',
      firstName: 'Grace',
      middleName: 'Villanueva',
      lastName: 'Mercado',
      contactNumber: '+63 917 000 0007',
      birthday: '1996-06-09',
      joined: '2023-09-02',
    },
  },
  {
    key: 'MEMBER',
    email: 'member4@csec.local',
    fullName: 'Daniel Uy',
    member: {
      number: 'CSEC-2024-0008',
      firstName: 'Daniel',
      middleName: 'Co',
      lastName: 'Uy',
      contactNumber: '+63 917 000 0008',
      birthday: '1991-03-27',
      joined: '2024-01-13',
    },
  },
  {
    key: 'MEMBER',
    email: 'inactive@csec.local',
    fullName: 'Benigno Aquino',
    status: 'DEACTIVATED',
    member: {
      number: 'CSEC-2024-0009',
      firstName: 'Benigno',
      middleName: 'Lim',
      lastName: 'Aquino',
      contactNumber: '+63 917 000 0009',
      birthday: '1983-12-11',
      joined: '2021-07-10',
    },
  },
];

async function seedDemoData() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const roles = Object.fromEntries(
    (await prisma.role.findMany()).map((role) => [role.key, role]),
  );

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@csec.local' } });
  const createdUsers = [];

  for (const entry of DEMO_USERS) {
    const role = roles[entry.key];
    if (!role) throw new Error(`Role ${entry.key} missing - run the reference seed first.`);

    const user = await prisma.user.upsert({
      where: { email: entry.email },
      create: {
        email: entry.email,
        passwordHash,
        fullName: entry.fullName,
        roleId: role.id,
        status: entry.status ?? 'ACTIVE',
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        createdAt: new Date(),
      },
      update: {
        fullName: entry.fullName,
        roleId: role.id,
        passwordHash,
      },
    });
    createdUsers.push(user);

    const member = await prisma.member.upsert({
      where: { memberNumber: entry.member.number },
      create: {
        memberNumber: entry.member.number,
        firstName: entry.member.firstName,
        middleName: entry.member.middleName,
        lastName: entry.member.lastName,
        email: entry.email,
        contactNumber: entry.member.contactNumber,
        birthday: at(entry.member.birthday),
        dateJoined: at(entry.member.joined),
        address: 'Centro Sugbo, Cebu, Philippines',
        emergencyName: 'Emergency Contact',
        emergencyPhone: '+63 900 000 0000',
        status: 'ACTIVE',
        userId: user.id,
        createdById: adminUser?.id ?? null,
      },
      update: { userId: user.id },
    });

    await prisma.user.update({ where: { id: user.id }, data: { memberId: member.id } });
    entry.memberId = member.id;
    entry.userId = user.id;
  }

  await seedOfficers(createdUsers);
  await seedContent(createdUsers);
  await seedFinance(createdUsers);
  await seedAttendance(createdUsers);
}

async function seedOfficers(users) {
  const positions = Object.fromEntries(
    (await prisma.officerPosition.findMany()).map((p) => [p.code, p]),
  );
  const president = users.find((u) => u.fullName === 'Miguel Santos');
  const secretary = users.find((u) => u.fullName === 'Luisa Fernandez');
  const treasurer = users.find((u) => u.fullName === 'Rafael Bautista');
  const admin = users.find((u) => u.fullName === 'Ana Dela Cruz');

  const assignments = [
    {
      memberId: president?.id,
      code: 'PRESIDENT',
      notes: 'Elected at the 2024 General Assembly.',
    },
    { memberId: secretary?.id, code: 'SECRETARY', notes: null },
    { memberId: treasurer?.id, code: 'TREASURER', notes: null },
  ];

  for (const item of assignments) {
    if (!item.memberId || !positions[item.code]) continue;
    const existing = await prisma.officerAssignment.findFirst({
      where: { memberId: item.memberId, positionId: positions[item.code].id },
    });
    if (existing) continue;
    await prisma.officerAssignment.create({
      data: {
        memberId: item.memberId,
        positionId: positions[item.code].id,
        termStart: at('2024-01-01'),
        termEnd: null,
        status: 'CURRENT',
        notes: item.notes,
        appointedById: admin?.id ?? null,
      },
    });
  }
}

function daysFromNow(days, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function seedContent(users) {
  const secretary = users.find((u) => u.fullName === 'Luisa Fernandez');

  const post = (data) =>
    prisma.post.upsert({ where: { slug: data.slug }, create: data, update: {} });

  await post({
    slug: 'welcome-to-the-csec-members-portal',
    title: 'Welcome to the Centro Sugbo Eagles Club Members Portal',
    category: 'ANNOUNCEMENT',
    excerpt: 'One secure place for club updates, attendance, dues and official records.',
    content:
      'Dear members,\n\nThe Centro Sugbo Eagles Club Members Portal is now live. From this ' +
      'portal you can read club updates, submit your attendance for meetings and ' +
      'activities, and submit payments for monthly dues and community service ' +
      'contributions.\n\nAttendance and payments are submitted for verification by the ' +
      'Secretary and Treasurer respectively, so please include accurate details and an ' +
      'uploaded proof of payment whenever possible.\n\nIf you have any questions, ' +
      'please contact the club Secretary.',
    status: 'PUBLISHED',
    isPinned: true,
    publishedAt: new Date(),
    createdById: secretary.id,
  });

  await post({
    slug: 'general-membership-meeting-agenda',
    title: 'General Membership Meeting - Quarterly Assembly',
    category: 'GMM',
    excerpt: 'Quarterly general membership meeting and election of officers.',
    content:
      'All active members are invited to the quarterly General Membership Meeting. ' +
      'The agenda covers the President report, Treasurer financial report, committee ' +
      'updates, and open forum.\n\nAttendance for this meeting counts towards your GMM ' +
      'attendance requirement - please submit your PRESENT request through the portal ' +
      'after the meeting.',
    status: 'PUBLISHED',
    eventDate: daysFromNow(14, 18),
    startTime: '6:00 PM',
    endTime: '9:00 PM',
    venue: 'Centro Sugbo Clubhouse, Main Hall',
    publishedAt: new Date(),
    createdById: secretary.id,
  });

  await post({
    slug: 'community-service-coastal-cleanup',
    title: 'Coastal Cleanup Community Service',
    category: 'COMMUNITY_SERVICE',
    excerpt: 'Volunteer-led coastal cleanup with community service credits.',
    content:
      'The club will hold a coastal cleanup activity. Participants earn community ' +
      'service credits and a certificate of appearance. Wearing comfortable footwear ' +
      'and bringing reusable bottles is encouraged.\n\nRegister through the portal and ' +
      'submit your PRESENT attendance request on the day.',
    status: 'PUBLISHED',
    eventDate: daysFromNow(30, 7),
    startTime: '7:00 AM',
    endTime: '11:00 AM',
    venue: 'Lapulapu Beach, Cebu',
    publishedAt: new Date(),
    createdById: secretary.id,
  });

  await post({
    slug: 'leadership-training-seminar',
    title: 'Leadership Training Seminar',
    category: 'ACTIVITIES',
    excerpt: 'Seminar on effective leadership for club officers.',
    content:
      'A half-day leadership seminar conducted by a resource speaker. Open to all ' +
      'members; officers are strongly encouraged to attend.',
    status: 'DRAFT',
    eventDate: daysFromNow(45, 13),
    venue: 'Clubhouse Function Room',
    createdById: secretary.id,
  });

  await post({
    slug: 'club-news-csd-partnership',
    title: 'Club Signs Memorandum with City Sports Office',
    category: 'NEWS',
    excerpt: 'A formal partnership supporting the youth basketball program.',
    content:
      'The Centro Sugbo Eagles Club has signed a memorandum of agreement with the ' +
      'City Sports Office to support the youth basketball program. The agreement covers ' +
      'facility access, coaching assistance and joint community events.',
    status: 'PUBLISHED',
    publishedAt: new Date(),
    createdById: secretary.id,
  });

  async function seedNotices(secretary) {
  const notices = [
    {
      id: 'seed-notice-dues-reminder',
      title: 'Reminder: Monthly Dues Deadline',
      content:
        'All members are reminded to settle their monthly dues on or before the due ' +
        'date shown in their account. Payments can be submitted through the portal for ' +
        'Treasurer verification.',
      priority: 'IMPORTANT',
    },
    {
      id: 'seed-notice-gmm-attendance',
      title: 'GMM Attendance Requirements',
      content:
        'Members are expected to attend at least two General Membership Meetings and two ' +
        'community service activities per membership year. Attendance is verified by the ' +
        'Secretary before it is recorded officially.',
      priority: 'URGENT',
    },
  ];

  for (const notice of notices) {
    await prisma.notice.upsert({
      where: { id: notice.id },
      create: {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        noticeDate: new Date(),
        priority: notice.priority,
        audience: 'ALL_MEMBERS',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdById: secretary.id,
      },
      update: {},
    });
  }
}

async function seedActivities(secretary) {
  const activity = (data) =>
    prisma.activity.upsert({ where: { id: data.id }, create: data, update: {} });

  await activity({
    id: 'seed-activity-gmm-1',
    title: 'First Quarterly General Membership Meeting',
    description: 'Quarterly assembly with committee reports and open forum.',
    type: 'GMM',
    category: 'GMM',
    startsAt: daysFromNow(-30, 18),
    endsAt: daysFromNow(-30, 21),
    venue: 'Centro Sugbo Clubhouse, Main Hall',
    requiresAttendance: true,
    status: 'PUBLISHED',
    publishedAt: daysFromNow(-45),
    createdById: secretary.id,
  });

  await activity({
    id: 'seed-activity-cs-1',
    title: 'Coastal Cleanup - Batch 1',
    description: 'Community service at Lapulapu Beach.',
    type: 'COMMUNITY_SERVICE',
    category: 'COMMUNITY_SERVICE',
    startsAt: daysFromNow(-21, 7),
    endsAt: daysFromNow(-21, 11),
    venue: 'Lapulapu Beach, Cebu',
    requiresAttendance: true,
    creditsHours: '4.00',
    feeAmount: '150.00',
    status: 'PUBLISHED',
    publishedAt: daysFromNow(-35),
    createdById: secretary.id,
  });

  await activity({
    id: 'seed-activity-upcoming-gmm',
    title: 'Second Quarterly General Membership Meeting',
    description: 'Quarterly assembly. Attendance requests are open for this event.',
    type: 'GMM',
    category: 'GMM',
    startsAt: daysFromNow(14, 18),
    endsAt: daysFromNow(14, 21),
    venue: 'Centro Sugbo Clubhouse, Main Hall',
    requiresAttendance: true,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    createdById: secretary.id,
  });

  await activity({
    id: 'seed-activity-upcoming-cs',
    title: 'Community Service - Tree Planting',
    description: 'Tree planting activity at the municipal park.',
    type: 'COMMUNITY_SERVICE',
    category: 'COMMUNITY_SERVICE',
    startsAt: daysFromNow(7, 8),
    endsAt: daysFromNow(7, 12),
    venue: 'Municipal Park, Cebu',
    requiresAttendance: true,
    creditsHours: '4.00',
    feeAmount: '150.00',
    status: 'PUBLISHED',
    publishedAt: new Date(),
    createdById: secretary.id,
  });
}

await seedNotices(secretary);
  await seedActivities(secretary);
  await seedMeetings(secretary, users.find((u) => u.fullName === 'Miguel Santos'));
}

async function seedMeetings(secretary, president) {
  const meeting = await prisma.meeting.upsert({
    where: { id: 'seed-meeting-gmm-1' },
    create: {
      id: 'seed-meeting-gmm-1',
      title: 'First Quarterly General Membership Meeting',
      meetingType: 'GENERAL_MEMBERSHIP_MEETING',
      meetingDate: dateOnly(daysFromNow(-30, 18)),
      startTime: '18:00',
      endTime: '21:00',
      venue: 'Centro Sugbo Clubhouse, Main Hall',
      description: 'Quarterly assembly with committee reports and open forum.',
      status: 'COMPLETED',
      activityId: 'seed-activity-gmm-1',
      presidingOfficerId: president?.id ?? null,
      createdById: secretary.id,
    },
    update: {},
  });

  await prisma.meetingMinute.upsert({
    where: { meetingId: meeting.id },
    create: {
      meetingId: meeting.id,
      title: 'Minutes of the First Quarterly General Membership Meeting',
      summary:
        'The meeting was called to order by the President. The Treasurer presented the ' +
        'financial report and the Secretary presented the membership report.',
      agenda:
        '1. Call to order and prayer\n2. Roll call and attendance\n3. President report\n' +
        '4. Treasurer financial report\n5. Committee reports\n6. Old business\n7. New business\n' +
        '8. Adjournment',
      discussion:
        'Members discussed the schedule of community service activities for the quarter ' +
        'and the requirements for GMM attendance. It was agreed that the attendance ' +
        'verification window is seven days after each event.',
      resolutions:
        'RESOLVED that the club adopt a seven-day attendance request window.\n' +
        'RESOLVED that community service contributions be set per activity as announced ' +
        'by the Secretary.',
      actionItems:
        '1. Secretary to publish the attendance verification notice.\n' +
        '2. Treasurer to post the financial report to the portal.\n' +
        '3. Committee chairs to submit activity proposals within 30 days.',
      status: 'APPROVED',
      preparedById: secretary.id,
      preparedByName: 'Luisa Fernandez',
      approvedById: president?.id ?? null,
      approvedByName: 'Miguel Santos',
      approvedAt: daysFromNow(-28),
    },
    update: {},
  });

  // A scheduled meeting so the "upcoming meetings" panels have data.
  await prisma.meeting.upsert({
    where: { id: 'seed-meeting-gmm-2' },
    create: {
      id: 'seed-meeting-gmm-2',
      title: 'Second Quarterly General Membership Meeting',
      meetingType: 'GENERAL_MEMBERSHIP_MEETING',
      meetingDate: dateOnly(daysFromNow(14, 18)),
      startTime: '18:00',
      endTime: '21:00',
      venue: 'Centro Sugbo Clubhouse, Main Hall',
      description: 'Quarterly assembly. Members are expected to submit attendance.',
      status: 'SCHEDULED',
      activityId: 'seed-activity-upcoming-gmm',
      presidingOfficerId: president?.id ?? null,
      createdById: secretary.id,
    },
    update: {},
  });
}

/**
 * Builds the deterministic `FinancialObligation.dedupeKey`.
 *
 * Re-running dues generation for the same member + period (or the same community
 * service activity) must never create a second obligation, so the key is a pure
 * function of those inputs. Keep the format in sync with lib/finance.js.
 */
function dedupeKey({ type, memberId, periodYear, periodMonth, activityId }) {
  const period =
    periodYear && periodMonth ? `${periodYear}-${String(periodMonth).padStart(2, '0')}` : 'NA';
  return `${type}:${memberId}:${period}:${activityId ?? 'NA'}`;
}

async function seedFinance(users) {
  const treasurer = users.find((u) => u.fullName === 'Rafael Bautista');
  const categories = Object.fromEntries(
    (await prisma.transactionCategory.findMany()).map((c) => [c.code, c]),
  );

  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { memberNumber: 'asc' },
  });

  const now = new Date();
  const duesAmount = '200.00';
  const months = [-2, -1, 0].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  // 1) Monthly dues for every active member for the last three months.
  for (const member of members) {
    for (const period of months) {
      const dueDate = new Date(period.year, period.month - 1, 10);
      const overdue = dueDate.getTime() < Date.now();
      await prisma.financialObligation.upsert({
        where: { dedupeKey: dedupeKey({ type: 'MONTHLY_DUES', memberId: member.id, ...period }) },
        create: {
          memberId: member.id,
          type: 'MONTHLY_DUES',
          title: `Monthly Dues - ${period.year}-${String(period.month).padStart(2, '0')}`,
          periodMonth: period.month,
          periodYear: period.year,
          amountDue: duesAmount,
          amountPaid: '0.00',
          balance: duesAmount,
          dueDate,
          status: overdue ? 'OVERDUE' : 'UNPAID',
          dedupeKey: dedupeKey({ type: 'MONTHLY_DUES', memberId: member.id, ...period }),
          createdById: treasurer.id,
        },
        update: {},
      });
    }
  }

  // 2) Community service obligation from the completed coastal cleanup.
  for (const member of members) {
    const key = dedupeKey({
      type: 'COMMUNITY_SERVICE',
      memberId: member.id,
      activityId: 'seed-activity-cs-1',
    });
    await prisma.financialObligation.upsert({
      where: { dedupeKey: key },
      create: {
        memberId: member.id,
        type: 'COMMUNITY_SERVICE',
        title: 'Community Service - Coastal Cleanup (Batch 1)',
        description: 'Contribution for the coastal cleanup community service activity.',
        amountDue: '150.00',
        amountPaid: '0.00',
        balance: '150.00',
        dueDate: dateOnly(daysFromNow(-14, 23)),
        status: 'OVERDUE',
        activityId: 'seed-activity-cs-1',
        dedupeKey: key,
        createdById: treasurer.id,
      },
      update: {},
    });
  }

  // 3) Settle the oldest month for the first few members -> Payment + ledger entry.
  const oldest = months[0];
  const settledMembers = members.slice(0, 4);
  let seq = 1;

  for (const member of settledMembers) {
    const obligation = await prisma.financialObligation.findUnique({
      where: {
        dedupeKey: dedupeKey({ type: 'MONTHLY_DUES', memberId: member.id, ...oldest }),
      },
    });
    if (!obligation || obligation.amountPaid !== '0.00') continue;

    const paymentNumber = `PAY-2024-${String(seq).padStart(4, '0')}`;
    const transactionNumber = `TXN-2024-${String(seq).padStart(4, '0')}`;
    const reference = `RCPT-${String(1000 + seq)}`;
    seq += 1;

    const transaction = await prisma.financialTransaction.create({
      data: {
        transactionNumber,
        transactionDate: obligation.dueDate,
        type: 'INCOME',
        categoryId: categories.DUES.id,
        description: `Monthly dues ${oldest.year}-${String(oldest.month).padStart(2, '0')}`,
        amount: '200.00',
        reference,
        memberId: member.id,
        recordedById: treasurer.id,
        recordedByName: 'Rafael Bautista',
      },
    });

    await prisma.payment.create({
      data: {
        paymentNumber,
        memberId: member.id,
        obligationId: obligation.id,
        amount: '200.00',
        paymentDate: obligation.dueDate,
        paymentMethod: 'CASH',
        referenceNumber: reference,
        isManual: true,
        approvedById: treasurer.id,
        approvedByName: 'Rafael Bautista',
        transactionId: transaction.id,
      },
    });

    await prisma.financialObligation.update({
      where: { id: obligation.id },
      data: { amountPaid: '200.00', balance: '0.00', status: 'PAID' },
    });
  }

  // 4) Expenses so the cash-flow report has both sides.
  const expenses = [
    ['EXPENSE_OPERATIONAL', 'Printing of attendance sheets and forms', '1250.00', -60],
    ['EXPENSE_EVENT', 'Venue rental - quarterly assembly', '3500.00', -30],
    ['EXPENSE_ACTIVITY', 'Coastal cleanup materials and gloves', '1825.50', -21],
    ['EXPENSE_OPERATIONAL', 'Club documentation printing and tarpaulin', '2400.00', -14],
  ];
  let expenseSeq = 500;
  for (const [code, description, amount, dayOffset] of expenses) {
    const number = `TXN-2024-${String(expenseSeq)}`;
    expenseSeq += 1;
    const existing = await prisma.financialTransaction.findUnique({
      where: { transactionNumber: number },
    });
    if (existing) continue;
    await prisma.financialTransaction.create({
      data: {
        transactionNumber: number,
        transactionDate: dateOnly(daysFromNow(dayOffset, 23)),
        type: 'EXPENSE',
        categoryId: categories[code].id,
        description,
        amount,
        reference: `VOUCHER-${expenseSeq}`,
        recordedById: treasurer.id,
        recordedByName: 'Rafael Bautista',
      },
    });
  }

  // A donation for income variety.
  const donationNumber = 'TXN-2024-600';
  if (!(await prisma.financialTransaction.findUnique({ where: { transactionNumber: donationNumber } }))) {
    await prisma.financialTransaction.create({
      data: {
        transactionNumber: donationNumber,
        transactionDate: dateOnly(daysFromNow(-40, 23)),
        type: 'INCOME',
        categoryId: categories.DONATION.id,
        description: 'Donation from supporting member',
        amount: '5000.00',
        reference: 'DON-0001',
        recordedById: treasurer.id,
        recordedByName: 'Rafael Bautista',
      },
    });
  }

  // 5) Payment submissions awaiting verification / already rejected.
  const target = members[4] ?? members[members.length - 1];
  if (target) {
    const current = months[months.length - 1];
    const obligation = await prisma.financialObligation.findUnique({
      where: {
        dedupeKey: dedupeKey({ type: 'MONTHLY_DUES', memberId: target.id, ...current }),
      },
    });
    await prisma.paymentSubmission.upsert({
      where: { memberId_referenceNumber: { memberId: target.id, referenceNumber: 'SEED-REF-PENDING' } },
      create: {
        memberId: target.id,
        obligationId: obligation?.id ?? null,
        type: 'MONTHLY_DUES',
        periodMonth: current.month,
        periodYear: current.year,
        amount: '100.00',
        paymentDate: new Date(),
        referenceNumber: 'SEED-REF-PENDING',
        paymentMethod: 'BANK_TRANSFER',
        notes: 'Partial payment for the current month. Transfer receipt attached.',
        status: 'PENDING_VERIFICATION',
      },
      update: {},
    });

    await prisma.paymentSubmission.upsert({
      where: { memberId_referenceNumber: { memberId: target.id, referenceNumber: 'SEED-REF-REJECTED' } },
      create: {
        memberId: target.id,
        type: 'MONTHLY_DUES',
        amount: '200.00',
        paymentDate: new Date(),
        referenceNumber: 'SEED-REF-REJECTED',
        paymentMethod: 'CASH',
        notes: 'Payment claimed but no reference found in the cashbook.',
        status: 'REJECTED',
        reviewedById: treasurer.id,
        reviewedByName: 'Rafael Bautista',
        reviewedAt: new Date(),
        reviewRemarks: 'Could not locate this receipt in the cashbook. Please resubmit.',
      },
      update: {},
    });

    // Reflect the pending submission on the obligation's status.
    if (obligation && obligation.amountPaid === '0.00') {
      await prisma.financialObligation.update({
        where: { id: obligation.id },
        data: { status: 'PENDING_VERIFICATION' },
      });
    }
  }
}

async function seedAttendance(users) {
  const secretary = users.find((u) => u.fullName === 'Luisa Fernandez');
  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { memberNumber: 'asc' },
  });

  // Completed events: a mix of approved records and pending/rejected requests so
  // the Secretary dashboard has something to review.
  const completedEvents = [
    { id: 'seed-activity-gmm-1', approved: 4, pending: 1, rejected: 1 },
    { id: 'seed-activity-cs-1', approved: 3, pending: 1, rejected: 0 },
  ];

  let index = 0;
  for (const event of completedEvents) {
    const approvedMembers = members.slice(index, index + event.approved);
    index += event.approved;

    for (const member of approvedMembers) {
      await prisma.attendanceRequest.upsert({
        where: { activityId_memberId: { activityId: event.id, memberId: member.id } },
        create: {
          activityId: event.id,
          memberId: member.id,
          status: 'APPROVED',
          submittedAt: daysFromNow(-31),
          reviewedById: secretary.id,
          reviewedAt: daysFromNow(-29),
          reviewRemarks: 'Verified against the attendance sheet.',
        },
        update: {},
      });

      await prisma.attendanceRecord.upsert({
        where: { activityId_memberId: { activityId: event.id, memberId: member.id } },
        create: {
          activityId: event.id,
          memberId: member.id,
          status: 'PRESENT',
          source: 'REQUEST_APPROVAL',
          hoursCredited: '4.00',
          approvedById: secretary.id,
          approvedAt: daysFromNow(-29),
        },
        update: {},
      });
    }

    for (let i = 0; i < event.pending; i += 1) {
      const member = members[index];
      index += 1;
      if (!member) break;
      await prisma.attendanceRequest.upsert({
        where: { activityId_memberId: { activityId: event.id, memberId: member.id } },
        create: {
          activityId: event.id,
          memberId: member.id,
          status: 'PENDING',
          memberRemarks: 'I was present for the whole session.',
          submittedAt: daysFromNow(-20),
        },
        update: {},
      });
    }

    for (let i = 0; i < event.rejected; i += 1) {
      const member = members[index];
      index += 1;
      if (!member) break;
      await prisma.attendanceRequest.upsert({
        where: { activityId_memberId: { activityId: event.id, memberId: member.id } },
        create: {
          activityId: event.id,
          memberId: member.id,
          status: 'REJECTED',
          submittedAt: daysFromNow(-25),
          reviewedById: secretary.id,
          reviewedAt: daysFromNow(-24),
          reviewRemarks: 'Could not be verified against the attendance sheet.',
        },
        update: {},
      });
    }
  }
}

function printDemoCredentials() {
  const rows = [
    ['System Administrator', 'admin@csec.local'],
    ['President', 'president@csec.local'],
    ['Secretary', 'secretary@csec.local'],
    ['Treasurer', 'treasurer@csec.local'],
    ['Club Member', 'member@csec.local'],
    ['Club Member', 'member2@csec.local'],
    ['Club Member', 'member3@csec.local'],
    ['Club Member', 'member4@csec.local'],
    ['Club Member (deactivated - cannot log in)', 'inactive@csec.local'],
  ];
  console.log('\n============================================================');
  console.log(' DEVELOPMENT-ONLY DEMO CREDENTIALS - DO NOT USE IN PRODUCTION');
  console.log(` Shared password: ${DEMO_PASSWORD}`);
  console.log('============================================================');
  for (const [role, email] of rows) {
    console.log(` ${role.padEnd(46)} ${email}`);
  }
  console.log('============================================================\n');
}

async function main() {
  console.log('[seed] starting…');

  const roleCount = await seedRoles();
  console.log(`[seed] roles ✔ (${roleCount})`);

  await seedSettings();
  console.log('[seed] settings ✔');

  await seedReferenceData();
  console.log('[seed] reference data ✔');

  if (!SHOULD_SEED_DEMO) {
    console.log('[seed] SEED_DEMO_DATA not enabled - skipping demo accounts.');
  } else if (looksLikeProduction()) {
    console.log(
      '[seed] SEED_DEMO_DATA enabled but a production database was detected - ' +
        'demo accounts were NOT created.',
    );
  } else {
    await seedDemoData();
    console.log('[seed] demo accounts & records ✔');
    printDemoCredentials();
  }

  console.log('[seed] done.');
}

main()
  .catch((error) => {
    console.error('[seed] FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });