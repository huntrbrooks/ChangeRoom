import { NextResponse } from 'next/server';

// Generation accounting is controlled exclusively by the Render worker.
export function POST() {
  return NextResponse.json({ error: 'client_settlement_disabled' }, { status: 410 });
}
