import { prisma } from './prisma';

/**
 * ---------------------------------------------------------------------------
 * Officer assignments
 * ---------------------------------------------------------------------------
 * Officer records are an append-only ledger. Appointing someone to a post ends
 * the previous holder's CURRENT term (status -> ENDED) and creates a new row, so
 * the full history of who held which office is always reconstructable.
 *
 * A partial UNIQUE index (see prisma/migrations/.../migration.sql) guarantees at
 * the database level that there can only be one CURRENT holder per position.
 */

export class OfficerError extends Error {
  constructor(message, code = 'OFFICER_ERROR') {
    super(message);
    this.name = 'OfficerError';
    this.code = code;
  }
}

function atStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Appoints (or re-appoints) a member to an office.
 *
 * @returns the created assignment.
 */
export async function appointOfficer({ memberId, positionId, termStart, termEnd, notes, appointedById }) {
  const start = atStartOfDay(new Date(termStart));

  return prisma.$transaction(async (tx) => {
    const position = await tx.officerPosition.findUnique({
      where: { id: positionId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!position) throw new OfficerError('That office does not exist.', 'NO_POSITION');
    if (!position.isActive) throw new OfficerError('That office is not currently active.', 'INACTIVE');

    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    if (!member) throw new OfficerError('That member does not exist.', 'NO_MEMBER');
    if (member.status !== 'ACTIVE') {
      throw new OfficerError('Only active members can hold office.', 'INACTIVE_MEMBER');
    }

    // End the incumbent's term rather than deleting or overwriting it.
    const incumbent = await tx.officerAssignment.findFirst({
      where: { positionId, status: 'CURRENT' },
      select: { id: true, memberId: true, termStart: true },
    });

    if (incumbent) {
      if (incumbent.memberId === memberId) {
        throw new OfficerError(
          `${member.firstName} ${member.lastName} already holds the office of ${position.name}.`,
          'ALREADY_HOLDS',
        );
      }
      await tx.officerAssignment.update({
        where: { id: incumbent.id },
        data: {
          status: 'ENDED',
          termEnd: start,
          notes: 'Term ended automatically when a successor was appointed.',
        },
      });
    }

    // A member may not hold the same office twice concurrently.
    const memberDuplicate = await tx.officerAssignment.findFirst({
      where: { memberId, positionId, status: 'CURRENT' },
      select: { id: true },
    });
    if (memberDuplicate) {
      throw new OfficerError(
        'This member already holds that office. End the current term first.',
        'ALREADY_HOLDS',
      );
    }

    return tx.officerAssignment.create({
      data: {
        memberId,
        positionId,
        termStart: start,
        termEnd: termEnd ? atStartOfDay(new Date(termEnd)) : null,
        status: 'CURRENT',
        notes: notes ?? null,
        appointedById: appointedById ?? null,
      },
      include: {
        member: { select: { id: true, firstName: true, middleName: true, lastName: true, memberNumber: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

/** Ends a term, keeping the historical row intact. */
export async function endOfficerTerm({ assignmentId, termEnd, notes }) {
  const end = atStartOfDay(new Date(termEnd));

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.officerAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, status: true, termStart: true, positionId: true },
    });
    if (!assignment) throw new OfficerError('That officer assignment does not exist.', 'NOT_FOUND');
    if (assignment.status !== 'CURRENT') {
      throw new OfficerError('Only a current term can be ended.', 'NOT_CURRENT');
    }
    if (end < assignment.termStart) {
      throw new OfficerError('The term end cannot be before the term start.', 'BAD_DATES');
    }

    return tx.officerAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ENDED', termEnd: end, notes: notes ?? null },
    });
  });
}

/** Current office holders, optionally including vacancies. */
export async function listCurrentOfficers() {
  const positions = await prisma.officerPosition.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      assignments: {
        where: { status: 'CURRENT' },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              memberNumber: true,
              email: true,
              profileImage: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  return positions.map((position) => ({
    id: position.id,
    code: position.code,
    name: position.name,
    description: position.description,
    assignment: position.assignments[0] ?? null,
  }));
}

/** Full officer history (all terms, newest first). */
export async function listOfficerHistory({ memberId, limit = 100 } = {}) {
  return prisma.officerAssignment.findMany({
    where: memberId ? { memberId } : undefined,
    orderBy: [{ status: 'asc' }, { termStart: 'desc' }],
    take: limit,
    include: {
      member: { select: { id: true, firstName: true, middleName: true, lastName: true, memberNumber: true } },
      position: { select: { id: true, code: true, name: true } },
      appointedBy: { select: { id: true, fullName: true } },
    },
  });
}