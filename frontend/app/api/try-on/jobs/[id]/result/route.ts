import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const result = await sql`SELECT encode(result_bytes,'base64') AS image FROM public.tryon_jobs
    WHERE id=${id}::uuid AND user_id=${userId} AND state='succeeded' AND result_bytes IS NOT NULL
    AND updated_at > now()-interval '24 hours'`;
  if (!result.rows[0]?.image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(result.rows[0].image, 'base64')), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
