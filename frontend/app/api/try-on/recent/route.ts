import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 401 });
  const { rows } = await sql`SELECT id, updated_at FROM public.tryon_jobs WHERE user_id=${userId}
    AND state='succeeded' AND result_bytes IS NOT NULL AND updated_at > now()-interval '24 hours'
    ORDER BY updated_at DESC LIMIT 20`;
  return NextResponse.json({ looks: rows }, { headers: { 'Cache-Control': 'private, no-store' } });
}
