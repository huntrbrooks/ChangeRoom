import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: 'persistent_uploads_disabled' }, { status: 410 });
}
