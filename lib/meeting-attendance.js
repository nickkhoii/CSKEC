import { prisma } from '@/lib/prisma';
import { fullName } from '@/lib/utils';

// Read the ledger each time; minutes must never retain a stale attendance copy.
export async function meetingAttendance(meetingId) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      activityId: true,
      activity: {
        select: {
          attendanceRecords: {
            where: { status: 'PRESENT' },
            orderBy: [{ member: { lastName: 'asc' } }, { member: { firstName: 'asc' } }, { memberId: 'asc' }],
            select: {
              id: true,
              member: { select: { id: true, memberNumber: true, firstName: true, middleName: true, lastName: true, suffix: true } },
            },
          },
        },
      },
    },
  });
  if (!meeting) return null;
  return {
    linked: Boolean(meeting.activityId),
    members: (meeting.activity?.attendanceRecords ?? []).map(({ id, member }) => ({
      id, memberId: member.id, memberNumber: member.memberNumber, name: fullName(member),
    })),
  };
}
