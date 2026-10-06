export async function resolveMemberId(db, value) {
  if (!value) return null;
  const member = await db.member.findFirst({ where: { OR: [{ id: value }, { memberNumber: value }] }, select: { id: true } });
  if (!member) {
    const error = new Error('The linked member record does not exist.');
    error.name = 'SettingError';
    throw error;
  }
  return member.id;
}

export async function syncMemberAccount(db, userId, memberId) {
  await db.member.updateMany({ where: { userId, ...(memberId ? { id: { not: memberId } } : {}) }, data: { userId: null } });
  if (memberId) await db.member.update({ where: { id: memberId }, data: { userId } });
}
