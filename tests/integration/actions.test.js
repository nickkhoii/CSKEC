import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayOffset, fakeFile, form, hasTestDatabase, load, truncateAll } from './harness';

/**
 * ---------------------------------------------------------------------------
 * Server-action integration suite
 *
 * Executes the real mutation paths against a real PostgreSQL database. Only the
 * Next.js edges (`@/auth`, `next/cache`, `next/headers`, `next/navigation`) are
 * stubbed, so the Prisma queries, domain services, Zod validation and audit
 * writes under test are the production ones.
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 * ---------------------------------------------------------------------------
 */

// The session the stubbed `auth()` resolves to. Tests switch identity with
// `signInAs`; each value is a full SessionUser as lib/session.js expects it.
const ctx = vi.hoisted(() => ({ user: null }));

vi.mock('@/auth', () => ({
  auth: async () => (ctx.user ? { user: ctx.user } : null),
  signIn: async () => {},
  signOut: async () => {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to) => {
    const error = new Error(`NEXT_REDIRECT:${to}`);
    error.digest = `NEXT_REDIRECT;${to}`;
    throw error;
  },
  permanentRedirect: () => {},
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Must be set before lib/prisma is imported, hence the dynamic imports below.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
  process.env.STORAGE_DRIVER = 'local';
}

describe.skipIf(!hasTestDatabase)('server actions', () => {
  let prisma;
  let db;
  let A; // attendance-actions
  let C; // content-actions
  let F; // finance-actions
  let M; // member-actions
  let AD; // admin-actions
  let AU; // auth-actions
  let officers; // lib/officers
  let settings; // lib/settings

  const users = {};
  const ids = {};

  /** Builds a signed-in SessionUser for a stored account. */
  function sessionFor(user) {
    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role.key,
      memberId: user.memberId,
      status: user.status,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
      permissions: user.role.permissions ?? [],
    };
  }

  const signInAs = (key) => {
    ctx.user = sessionFor(users[key]);
  };

  beforeAll(async () => {
    prisma = (await load('@/lib/prisma')).prisma;
    await truncateAll(prisma);

    A = await load('@/actions/attendance-actions');
    C = await load('@/actions/content-actions');
    F = await load('@/actions/finance-actions');
    M = await load('@/actions/member-actions');
    AD = await load('@/actions/admin-actions');
    AU = await load('@/actions/auth-actions');
    officers = await load('@/lib/officers');
    settings = await load('@/lib/settings');
    db = prisma;

    const roleIds = {};
    for (const key of ['MEMBER', 'SECRETARY', 'TREASURER', 'PRESIDENT', 'SYSTEM_ADMIN']) {
      const role = await db.role.create({ data: { key, name: key, permissions: [] } });
      roleIds[key] = role.id;
    }

    const { hashPassword } = await load('@/lib/password');
    const passwordHash = await hashPassword('ChangeMe!2024');

    const member = await db.member.create({
      data: {
        memberNumber: 'CSEC-TEST-0001',
        firstName: 'Ana',
        lastName: 'Reyes',
        email: 'ana@test.local',
        dateJoined: new Date('2024-01-15'),
        status: 'ACTIVE',
      },
    });
    ids.member = member.id;

    const mkUser = (key, email, fullName, memberId = null) =>
      db.user.create({
        data: { email, fullName, passwordHash, roleId: roleIds[key], memberId },
        include: { role: true },
      });

    users.MEMBER = await mkUser('MEMBER', 'member@test.local', 'Ana Reyes', member.id);
    users.SECRETARY = await mkUser('SECRETARY', 'secretary@test.local', 'Bea Santos');
    users.TREASURER = await mkUser('TREASURER', 'treasurer@test.local', 'Tong Dela Cruz');
    users.PRESIDENT = await mkUser('PRESIDENT', 'president@test.local', 'Pat Reyes');
    users.SYSTEM_ADMIN = await mkUser('SYSTEM_ADMIN', 'admin@test.local', 'System Admin');
    ids.roleMember = roleIds.MEMBER;

    // Mirror prisma/seed.js: lib/finance.js resolves the ledger category for a
    // payment by CODE (DUES / COMMUNITY_SERVICE / OTHER_FEE), not by type, so the
    // fixture must carry the same codes or approval cannot find a category.
    const categoryRows = [
      ['DUES', 'Monthly Dues', 'INCOME'],
      ['OTHER_FEE', 'Other Club Fee', 'INCOME'],
      ['DONATION', 'Donation', 'INCOME'],
      ['EXPENSE_OPERATIONAL', 'Operational Expense', 'EXPENSE'],
    ];
    for (const [code, name, type] of categoryRows) {
      const row = await db.transactionCategory.create({
        data: { code, name, type, isSystem: true },
      });
      if (code === 'EXPENSE_OPERATIONAL') ids.expenseCategory = row.id;
      if (code === 'DONATION') ids.incomeCategory = row.id;
    }

    ids.position = (
      await db.officerPosition.create({
        data: { code: 'AUDITOR', name: 'Auditor', sortOrder: 9 },
      })
    ).id;

    // Two activities: AttendanceRequest and AttendanceRecord are both unique on
    // (activityId, memberId), so each scenario needs its own event.
    const makeActivity = (title, hoursAgo) =>
      db.activity.create({
        data: {
          title,
          type: 'GMM',
          category: 'GMM',
          startsAt: new Date(dayOffset(hoursAgo) + 'T09:00:00Z'),
          status: 'PUBLISHED',
          publishedAt: new Date(),
          requiresAttendance: true,
          createdById: users.SECRETARY.id,
        },
      });

    ids.activity = (await makeActivity('Monthly General Meeting', -1)).id;
    ids.activity2 = (await makeActivity('Board Meeting', -1)).id;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  // =========================================================================
  describe('attendance', () => {
    it('lets a member submit, and the Secretary approve, an attendance request', async () => {
      signInAs('MEMBER');
      const submitted = await A.submitAttendanceAction(null, form({ activityId: ids.activity }));
      expect(submitted.success, JSON.stringify(submitted)).toBe(true);

      const request = await db.attendanceRequest.findFirst({ where: { memberId: ids.member } });
      expect(request.status).toBe('PENDING');

      const again = await A.submitAttendanceAction(null, form({ activityId: ids.activity }));
      expect(again.success).toBe(false);

      signInAs('SECRETARY');
      const reviewed = await A.reviewAttendanceAction(
        form({ requestId: request.id, decision: 'APPROVE', remarks: 'Confirmed by roster.' }),
      );
      expect(reviewed.success, JSON.stringify(reviewed)).toBe(true);

      const after = await db.attendanceRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(after.status).toBe('APPROVED');
      expect(after.reviewedById).toBe(users.SECRETARY.id);

      // Approval must also write the attendance record the portal counts.
      const record = await db.attendanceRecord.findFirst({
        where: { memberId: ids.member, activityId: ids.activity },
      });
      expect(record).toBeTruthy();
      expect(record.status).toBe('PRESENT');
    });

    it('refuses a Treasurer approval and a self-review', async () => {
      const request = await db.attendanceRequest.create({
        data: {
          activityId: ids.activity2,
          memberId: ids.member,
          status: 'PENDING',
        },
      });

      signInAs('TREASURER');
      const asTreasurer = await A.reviewAttendanceAction(
        form({ requestId: request.id, decision: 'APPROVE' }),
      );
      expect(asTreasurer.success).toBe(false);

      // The requester can never approve their own attendance, even though the
      // reviewer role would otherwise be allowed to.
      signInAs('MEMBER');
      const selfReview = await A.reviewAttendanceAction(
        form({ requestId: request.id, decision: 'APPROVE' }),
      );
      expect(selfReview.success).toBe(false);

      await db.attendanceRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
      });
    });

    it('records a manual roll call for the Secretary', async () => {
      signInAs('SECRETARY');
      const result = await A.manualAttendanceAction(
        form({
          activityId: ids.activity2,
          memberIds: [ids.member],
          recordStatus: 'PRESENT',
          remarks: 'On site.',
        }),
      );
      expect(result.success, JSON.stringify(result)).toBe(true);

      const record = await db.attendanceRecord.findFirst({
        where: { memberId: ids.member, activityId: ids.activity2 },
      });
      expect(record?.status).toBe('PRESENT');
    });
  });

  // =========================================================================
  describe('payments', () => {
    let obligationId;

    beforeAll(async () => {
      obligationId = (
        await db.financialObligation.create({
          data: {
            memberId: ids.member,
            type: 'MONTHLY_DUES',
            title: 'Monthly Dues - 2026-01',
            periodMonth: 1,
            periodYear: 2026,
            amountDue: '500.00',
            amountPaid: '0.00',
            balance: '500.00',
            dueDate: new Date('2026-01-20'),
            status: 'UNPAID',
            dedupeKey: 'test:dues:1:2026',
            createdById: users.TREASURER.id,
          },
        })
      ).id;
    });

    it('submits a payment with a proof upload, then the Treasurer verifies it', async () => {
      signInAs('MEMBER');
      const fd = form({
        obligationId,
        type: 'MONTHLY_DUES',
        periodMonth: 1,
        periodYear: 2026,
        amount: '500.00',
        paymentDate: dayOffset(-2),
        referenceNumber: 'RCPT-TEST-1',
        paymentMethod: 'BANK_TRANSFER',
        notes: 'Paid via BDO online banking.',
      });
      fd.set('proof', fakeFile({ name: 'proof.png', type: 'image/png' }));

      const submitted = await F.submitPaymentAction(null, fd);
      expect(submitted.success, JSON.stringify(submitted)).toBe(true);

      const submission = await db.paymentSubmission.findFirstOrThrow({
        where: { referenceNumber: 'RCPT-TEST-1' },
      });
      expect(submission.status).toBe('PENDING_VERIFICATION');

      // The upload really landed on disk and was linked to the submission.
      const attachment = await db.attachment.findFirst({
        where: { submissionId: submission.id },
      });
      expect(attachment).toBeTruthy();
      expect(attachment.url).toMatch(/^\/api\/files\//);

      // A member may not post against somebody else's obligation.
      const otherMember = await db.member.create({
        data: {
          memberNumber: 'CSEC-TEST-0002',
          firstName: 'Other',
          lastName: 'Member',
          email: 'other@test.local',
          dateJoined: new Date('2024-01-15'),
        },
      });
      const other = await db.financialObligation.create({
        data: {
          memberId: otherMember.id,
          type: 'MONTHLY_DUES',
          title: 'Other dues',
          amountDue: '100.00',
          amountPaid: '0.00',
          balance: '100.00',
          dueDate: new Date('2026-01-20'),
          dedupeKey: 'test:dues:other',
        },
      });
      const wrongObligation = await F.submitPaymentAction(
        null,
        form({
          obligationId: other.id,
          type: 'MONTHLY_DUES',
          periodMonth: 1,
          periodYear: 2026,
          amount: '100.00',
          paymentDate: dayOffset(-1),
          referenceNumber: 'RCPT-TEST-X',
          paymentMethod: 'CASH',
        }),
      );
      expect(wrongObligation.success).toBe(false);

      // Treasurer approval writes a Payment and settles the obligation.
      signInAs('TREASURER');
      const approved = await F.reviewPaymentAction(
        form({ submissionId: submission.id, decision: 'APPROVE', remarks: 'Verified.' }),
      );
      expect(approved.success, JSON.stringify(approved)).toBe(true);

      const payment = await db.payment.findFirst({ where: { submissionId: submission.id } });
      expect(payment).toBeTruthy();
      expect(Number(payment.amount)).toBe(500);

      const settled = await db.financialObligation.findUniqueOrThrow({
        where: { id: obligationId },
      });
      expect(settled.status).toBe('PAID');
      expect(Number(settled.balance)).toBe(0);
    });

    it('rejects a payment and leaves no Payment row behind', async () => {
      signInAs('MEMBER');
      await F.submitPaymentAction(
        null,
        form({
          type: 'OTHER_FEE',
          amount: '75.00',
          paymentDate: dayOffset(-1),
          referenceNumber: 'RCPT-TEST-2',
          paymentMethod: 'CASH',
        }),
      );
      const submission = await db.paymentSubmission.findFirstOrThrow({
        where: { referenceNumber: 'RCPT-TEST-2' },
      });

      signInAs('TREASURER');
      const rejected = await F.reviewPaymentAction(
        form({ submissionId: submission.id, decision: 'REJECT', remarks: 'No matching receipt.' }),
      );
      expect(rejected.success, JSON.stringify(rejected)).toBe(true);

      const after = await db.paymentSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      expect(after.status).toBe('REJECTED');
      expect(await db.payment.count({ where: { submissionId: submission.id } })).toBe(0);
    });

    it('refuses a member-verified payment', async () => {
      signInAs('MEMBER');
      await F.submitPaymentAction(
        null,
        form({
          type: 'OTHER_FEE',
          amount: '50.00',
          paymentDate: dayOffset(-1),
          referenceNumber: 'RCPT-TEST-3',
          paymentMethod: 'CASH',
        }),
      );
      const submission = await db.paymentSubmission.findFirstOrThrow({
        where: { referenceNumber: 'RCPT-TEST-3' },
      });

      const denied = await F.reviewPaymentAction(
        form({ submissionId: submission.id, decision: 'APPROVE' }),
      );
      expect(denied.success).toBe(false);
    });
  });

  // =========================================================================
  describe('ledger', () => {
    it('posts an income entry and voids it with a recorded reason', async () => {
      signInAs('TREASURER');
      const created = await F.createTransactionAction(
        null,
        form({
          type: 'INCOME',
          categoryId: ids.incomeCategory,
          transactionDate: dayOffset(-3),
          description: 'Fundraising bake sale proceeds',
          amount: '1250.00',
          reference: 'FR-001',
        }),
      );
      expect(created.success, JSON.stringify(created)).toBe(true);

      const txn = await db.financialTransaction.findFirstOrThrow({
        where: { description: 'Fundraising bake sale proceeds' },
      });
      expect(txn.status).toBe('POSTED');
      expect(Number(txn.amount)).toBe(1250);

      // A reason shorter than 5 characters is refused.
      const tooShort = await F.voidTransactionAction(form({ transactionId: txn.id, reason: 'x' }));
      expect(tooShort.success).toBe(false);

      const voided = await F.voidTransactionAction(
        form({ transactionId: txn.id, reason: 'Amount was double counted.' }),
      );
      expect(voided.success, JSON.stringify(voided)).toBe(true);

      const after = await db.financialTransaction.findUniqueOrThrow({ where: { id: txn.id } });
      expect(after.status).toBe('VOIDED');
      expect(after.voidReason).toContain('double counted');
      // History is retained, never deleted.
      expect(await db.financialTransaction.count({ where: { id: txn.id } })).toBe(1);
    });

    it('rejects a future-dated entry and a non-Treasurer writer', async () => {
      signInAs('TREASURER');
      const future = await F.createTransactionAction(
        null,
        form({
          type: 'EXPENSE',
          categoryId: ids.expenseCategory,
          transactionDate: dayOffset(5),
          description: 'Future dated expense',
          amount: '10.00',
        }),
      );
      expect(future.success).toBe(false);

      signInAs('MEMBER');
      const asMember = await F.createTransactionAction(
        null,
        form({
          type: 'INCOME',
          categoryId: ids.incomeCategory,
          transactionDate: dayOffset(-1),
          description: 'Member tries to post',
          amount: '999.00',
        }),
      );
      expect(asMember.success).toBe(false);
    });
  });

  // =========================================================================
  describe('notices and posts', () => {
    it('creates, updates and publishes a notice with an expiry date', async () => {
      signInAs('SECRETARY');
      const created = await C.createNoticeAction(
        null,
        form({
          title: 'Dues deadline',
          content: 'Monthly dues are due on the 20th of each month.',
          noticeDate: dayOffset(0),
          expiryDate: dayOffset(30),
          priority: 'IMPORTANT',
          audience: 'ALL_MEMBERS',
          status: 'DRAFT',
        }),
      );
      expect(created.success, JSON.stringify(created)).toBe(true);

      const notice = await db.notice.findFirstOrThrow({ where: { title: 'Dues deadline' } });
      expect(notice.expiryDate).not.toBeNull();

      const updated = await C.updateNoticeAction(
        null,
        form({
          id: notice.id,
          title: 'Dues deadline (extended)',
          content: 'Monthly dues are due on the 25th of each month.',
          noticeDate: dayOffset(0),
          expiryDate: dayOffset(45),
          priority: 'URGENT',
          audience: 'ALL_MEMBERS',
          status: 'DRAFT',
        }),
      );
      expect(updated.success, JSON.stringify(updated)).toBe(true);

      const after = await db.notice.findUniqueOrThrow({ where: { id: notice.id } });
      expect(after.title).toBe('Dues deadline (extended)');
      expect(after.priority).toBe('URGENT');

      const published = await C.setNoticeStatusAction(notice.id, 'PUBLISHED');
      expect(published.success, JSON.stringify(published)).toBe(true);
      const reloaded = await db.notice.findUniqueOrThrow({ where: { id: notice.id } });
      expect(reloaded.publishedAt).not.toBeNull();
    });

    it('rejects an expiry date that precedes the notice date', async () => {
      signInAs('SECRETARY');
      const result = await C.createNoticeAction(
        null,
        form({
          title: 'Backwards window',
          content: 'Expiry is before the notice date.',
          noticeDate: dayOffset(10),
          expiryDate: dayOffset(1),
        }),
      );
      expect(result.success).toBe(false);
    });

    it('creates and publishes a post, and refuses a plain member', async () => {
      signInAs('SECRETARY');
      const created = await C.createPostAction(
        null,
        form({
          title: 'General assembly',
          category: 'ANNOUNCEMENT',
          content: 'The general assembly is on the last Friday of the month.',
          status: 'DRAFT',
        }),
      );
      expect(created.success, JSON.stringify(created)).toBe(true);

      const post = await db.post.findFirstOrThrow({ where: { title: 'General assembly' } });
      expect((await C.setPostStatusAction(post.id, 'PUBLISHED')).success).toBe(true);

      signInAs('MEMBER');
      const denied = await C.createPostAction(
        null,
        form({
          title: 'Member post',
          category: 'NEWS',
          content: 'A member should not be able to publish this.',
        }),
      );
      expect(denied.success).toBe(false);
    });
  });

  // =========================================================================
  describe('officer management', () => {
    it('appoints an officer and ends the term without losing history', async () => {
      signInAs('PRESIDENT');
      const appointed = await C.appointOfficerAction(
        null,
        form({
          memberId: ids.member,
          positionId: ids.position,
          termStart: dayOffset(-30),
          notes: 'Elected at the assembly.',
        }),
      );
      expect(appointed.success, JSON.stringify(appointed)).toBe(true);

      const assignment = await db.officerAssignment.findFirstOrThrow({
        where: { memberId: ids.member, positionId: ids.position },
      });
      expect(assignment.status).toBe('CURRENT');

      const ended = await C.endOfficerTermAction(
        form({ assignmentId: assignment.id, termEnd: dayOffset(-1), notes: 'Term completed.' }),
      );
      expect(ended.success, JSON.stringify(ended)).toBe(true);

      const after = await db.officerAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
      expect(after.status).toBe('ENDED');
      expect(after.termEnd).not.toBeNull();
      // Append-only: the row survives.
      expect(await db.officerAssignment.count({ where: { id: assignment.id } })).toBe(1);
    });

    it('refuses a second concurrent holder of the same office', async () => {
      signInAs('PRESIDENT');
      await officers.appointOfficer({
        memberId: ids.member,
        positionId: ids.position,
        termStart: dayOffset(0),
        appointedById: users.PRESIDENT.id,
      });
      await expect(
        officers.appointOfficer({
          memberId: ids.member,
          positionId: ids.position,
          termStart: dayOffset(1),
          appointedById: users.PRESIDENT.id,
        }),
      ).rejects.toThrow(/already holds/i);

      expect(
        await db.officerAssignment.count({ where: { positionId: ids.position, status: 'CURRENT' } }),
      ).toBe(1);
    });
  });

  // =========================================================================
  describe('members, profile and settings', () => {
    it('creates a member through the Secretary action', async () => {
      signInAs('SECRETARY');
      const created = await M.createMemberAction(
        null,
        form({
          firstName: 'Paolo',
          lastName: 'Garcia',
          email: 'paolo@test.local',
          dateJoined: dayOffset(-60),
          contactNumber: '+63 917 000 0002',
        }),
      );
      expect(created.success, JSON.stringify(created)).toBe(true);

      const member = await db.member.findFirstOrThrow({ where: { email: 'paolo@test.local' } });
      expect(member.memberNumber).toMatch(/^CSEC-/);

      // Duplicate e-mail is a friendly failure, not a 500.
      const duplicate = await M.createMemberAction(
        null,
        form({
          firstName: 'Paolo',
          lastName: 'Garcia',
          email: 'paolo@test.local',
          dateJoined: dayOffset(-60),
        }),
      );
      expect(duplicate.success).toBe(false);

      signInAs('MEMBER');
      const denied = await M.createMemberAction(
        null,
        form({
          firstName: 'Nope',
          lastName: 'Nope',
          email: 'nope@test.local',
          dateJoined: dayOffset(-1),
        }),
      );
      expect(denied.success).toBe(false);
    });

    it('lets a member update their own profile', async () => {
      signInAs('MEMBER');
      const updated = await AU.updateProfileAction(
        null,
        form({
          contactNumber: '+63 917 111 2222',
          address: '12 Falcon Street, Cebu City',
          bloodType: 'O+',
          emergencyName: 'Ana Reyes Sr.',
          emergencyPhone: '+63 917 333 4444',
        }),
      );
      expect(updated.success, JSON.stringify(updated)).toBe(true);

      const member = await db.member.findUniqueOrThrow({ where: { id: ids.member } });
      expect(member.contactNumber).toBe('+63 917 111 2222');
      expect(member.bloodType).toBe('O+');
    });

    it('updates a system setting only as the System Administrator', async () => {
      signInAs('TREASURER');
      const denied = await F.updateSettingAction(form({ key: 'club.name', value: 'Hacked' }));
      expect(denied.success).toBe(false);

      signInAs('SYSTEM_ADMIN');
      const allowed = await F.updateSettingAction(
        form({ key: 'finance.default_dues_amount', value: '250.00' }),
      );
      expect(allowed.success, JSON.stringify(allowed)).toBe(true);

      settings.clearSettingsCache();
      expect(await settings.getSetting('finance.default_dues_amount')).toBe('250.00');
    });

    it('creates and deactivates a user as the System Administrator', async () => {
      signInAs('SYSTEM_ADMIN');
      const created = await AD.createUserAction(
        null,
        form({
          email: 'newuser@test.local',
          fullName: 'New User',
          password: 'Str0ng!Passw0rd',
          confirmPassword: 'Str0ng!Passw0rd',
          role: 'MEMBER',
        }),
      );
      expect(created.success, JSON.stringify(created)).toBe(true);

      const user = await db.user.findFirstOrThrow({ where: { email: 'newuser@test.local' } });
      expect(user.roleId).toBe(ids.roleMember);

      const deactivated = await AD.setUserStatusAction(
        form({ userId: user.id, status: 'DEACTIVATED', reason: 'Left the club.' }),
      );
      expect(deactivated.success, JSON.stringify(deactivated)).toBe(true);

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.status).toBe('DEACTIVATED');
      expect(after.deletedAt).not.toBeNull();
    });
  });

  // =========================================================================
  describe('audit regressions', () => {
    it('redirects successful login without rereading the incoming session cookie', async () => {
      ctx.user = null;
      await expect(AU.loginAction(null, form({ email: 'member@test.local', password: 'ChangeMe!2024' }))).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;/dashboard' });
    });
    it('invalidates a session when its token version is revoked', async () => {
      signInAs('MEMBER');
      const session = await load('@/lib/session');
      await db.user.update({ where: { id: users.MEMBER.id }, data: { tokenVersion: { increment: 1 } } });
      expect(await session.getSessionUser()).toBeNull();
      users.MEMBER = await db.user.findUnique({ where: { id: users.MEMBER.id }, include: { role: true } });
    });
    it('prevents Secretary-created administrator accounts', async () => {
      signInAs('SECRETARY');
      const result = await M.createMemberAction(null, form({ firstName: 'Malicious', lastName: 'Account',
        email: 'escalation@test.local', dateJoined: dayOffset(-1), createAccount: 'on',
        accountPassword: 'Str0ng!Passw0rd', role: 'SYSTEM_ADMIN' }));
      expect(result.success).toBe(false);
      expect(await db.user.count({ where: { email: 'escalation@test.local' } })).toBe(0);
    });
    it('reactivates an account through the edit form and clears its soft deletion', async () => {
      signInAs('SYSTEM_ADMIN');
      const account = await db.user.findUniqueOrThrow({ where: { email: 'newuser@test.local' } });
      const result = await AD.updateUserAction(null, form({ id: account.id, email: account.email,
        fullName: account.fullName, role: 'MEMBER', status: 'ACTIVE' }));
      expect(result.success, JSON.stringify(result)).toBe(true);
      expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).deletedAt).toBeNull();
    });
    it('restores an obligation balance when its payment transaction is voided', async () => {
      signInAs('TREASURER');
      const payment = await db.payment.findFirstOrThrow({ where: { referenceNumber: 'RCPT-TEST-1' } });
      const result = await F.voidTransactionAction(form({ transactionId: payment.transactionId, reason: 'Payment reversed by the bank.' }));
      expect(result.success, JSON.stringify(result)).toBe(true);
      const obligation = await db.financialObligation.findUniqueOrThrow({ where: { id: payment.obligationId } });
      expect(Number(obligation.balance)).toBe(500);
      expect(Number(obligation.amountPaid)).toBe(0);
    });
    it('refuses a manual payment exceeding the obligation balance', async () => {
      signInAs('TREASURER');
      const obligation = await db.financialObligation.findFirstOrThrow({ where: { memberId: ids.member } });
      const finance = await load('@/lib/finance');
      await expect(finance.recordManualPayment({ memberId: ids.member, obligationId: obligation.id,
        amount: '999999.00', paymentDate: new Date(), referenceNumber: 'OVERPAY-TEST', paymentMethod: 'CASH',
        reviewer: ctx.user })).rejects.toMatchObject({ code: 'OVERPAY' });
    });
    it('creates and edits activity times, and meeting details', async () => {
      signInAs('SECRETARY');
      const activityFields = { title: 'Editable activity', type: 'GMM', category: 'GMM',
        startsAt: `${dayOffset(-1)}T09:00`, endsAt: `${dayOffset(-1)}T10:00`, status: 'DRAFT' };
      const created = await C.createActivityAction(null, form(activityFields));
      expect(created.success, JSON.stringify(created)).toBe(true);
      const edited = await C.updateActivityAction(null, form({ ...activityFields, id: created.data.id, title: 'Updated activity' }));
      expect(edited.success, JSON.stringify(edited)).toBe(true);
      const meetingFields = { title: 'Editable meeting', meetingType: 'GENERAL_MEMBERSHIP_MEETING',
        meetingDate: dayOffset(1), startTime: '09:00 AM', status: 'SCHEDULED' };
      const meeting = await C.createMeetingAction(null, form(meetingFields));
      expect(meeting.success, JSON.stringify(meeting)).toBe(true);
      const changed = await C.updateMeetingAction(null, form({ ...meetingFields, id: meeting.data.id, status: 'CANCELLED' }));
      expect(changed.success, JSON.stringify(changed)).toBe(true);
    });
  });

  describe('audit trail', () => {
    it('records rows for sensitive actions and never stores secrets', async () => {
      const entries = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
      expect(entries.length).toBeGreaterThan(0);

      const serialised = JSON.stringify(entries);
      expect(serialised).not.toContain('ChangeMe!2024');
      expect(serialised).not.toContain('Str0ng!Passw0rd');
      expect(serialised).not.toContain('AUTH_SECRET');
    });
  });
});
