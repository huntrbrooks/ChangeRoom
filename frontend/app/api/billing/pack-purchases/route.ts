import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { listPackPurchases } from '@/lib/db-access';

const headers = {'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer'};
export async function GET(request: NextRequest) {
  try {
    const {userId} = await auth();
    if (!userId) return NextResponse.json({error:'Unauthorized'}, {status:401,headers});
    const page = request.nextUrl.searchParams.get('page') ?? '0';
    if (!/^(?:0|[1-9][0-9]{0,5})$/.test(page) || Number(page) > 100000)
      return NextResponse.json({error:'invalid_page'}, {status:400,headers});
    return NextResponse.json(await listPackPurchases(userId,Number(page)),{headers});
  } catch {
    return NextResponse.json({error:'Unable to load pack purchases.'},{status:503,headers});
  }
}
