import { NextRequest, NextResponse } from "next/server";

import { hasValidFrontrunnerDemoSession, FRONTRUNNER_DEMO_COOKIE_NAME } from "@/lib/frontrunnerDemoAccess";
import { getPitchCatalog, getPitchDashboard } from "@/lib/pitch/data";

export async function GET(req: NextRequest) {
  if (!hasValidFrontrunnerDemoSession(req.cookies.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "demo_access_required" }, { status: 401 });
  }

  const brandSlug = req.nextUrl.searchParams.get("brandSlug") || undefined;
  const catalog = await getPitchCatalog(brandSlug);
  const dashboard = await getPitchDashboard(catalog.brandSlug);

  return NextResponse.json({ dashboard, catalog });
}
