import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { requireUserApi } from '@/lib/session';
import { roleCan, PERMISSIONS } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const user = await requireUserApi();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { folder, name } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(folder) || !/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) {
    return new Response('Not found', { status: 404 });
  }
  const attachment = await prisma.attachment.findFirst({
    where: { storedName: name, url: { in: [`/api/files/${folder}/${name}`, `/uploads/${folder}/${name}`] } },
    include: { submission: true, post: true, notice: true, minute: true },
  });
  if (!attachment) return new Response('Not found', { status: 404 });
  let allowed = attachment.uploadedById === user.id;
  if (attachment.submission) allowed ||= attachment.submission.memberId === user.memberId || roleCan(user.role, PERMISSIONS.FINANCE_REVIEW_PAYMENT);
  if (attachment.memberId) allowed ||= attachment.memberId === user.memberId || roleCan(user.role, PERMISSIONS.MEMBER_MANAGE);
  if (attachment.post) allowed ||= attachment.post.status === 'PUBLISHED' || roleCan(user.role, PERMISSIONS.POST_MANAGE);
  if (attachment.minute) allowed ||= attachment.minute.status === 'APPROVED' || roleCan(user.role, PERMISSIONS.MINUTE_MANAGE);
  if (attachment.notice) {
    const { status, audience } = attachment.notice;
    allowed ||= roleCan(user.role, PERMISSIONS.NOTICE_MANAGE) || (status === 'PUBLISHED' &&
      (audience === 'ALL_MEMBERS' || audience === user.role || (audience === 'ALL_OFFICERS' && ['SECRETARY', 'TREASURER', 'PRESIDENT', 'SYSTEM_ADMIN'].includes(user.role))));
  }
  if (!allowed) return new Response('Forbidden', { status: 403 });
  try {
    const bytes = await readFile(path.join(process.cwd(), '.data', 'uploads', folder, name));
    return new Response(bytes, { headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error.code === 'ENOENT') return new Response('Not found', { status: 404 });
    throw error;
  }
}
