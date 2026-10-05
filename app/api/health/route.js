import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness / readiness probe for deployment platforms (Vercel, uptime monitors).
 *
 * Deliberately unauthenticated and deliberately harmless: it reports whether the
 * database is reachable and returns row counts only - never any member data,
 * configuration or secrets.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const [members, users] = await Promise.all([
      prisma.member.count(),
      prisma.user.count(),
    ]);

    return NextResponse.json(
      {
        status: 'ok',
        database: 'connected',
        databaseLatencyMs: Date.now() - startedAt,
        counts: { members, users },
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health] database check failed', error?.message ?? error);
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}