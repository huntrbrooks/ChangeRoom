import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { hasValidFrontrunnerDemoSession, FRONTRUNNER_DEMO_COOKIE_NAME } from "@/lib/frontrunnerDemoAccess";
import { getPitchCatalog, getPitchDashboard, importPitchCatalog } from "@/lib/pitch/data";
import { normalizePartnerCsv } from "@/lib/pitch/feed";
import { PITCH_DEMO_CATALOG } from "@/lib/pitch/sampleCatalog";
import { csvImportRequestSchema, seedCatalogRequestSchema } from "@/lib/pitch/schemas";

function validationErrorResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: "invalid_request",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "demo_access_required" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!hasValidFrontrunnerDemoSession(req.cookies.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value)) {
    return unauthorizedResponse();
  }

  const brandSlug = req.nextUrl.searchParams.get("brandSlug") || undefined;
  const catalog = await getPitchCatalog(brandSlug);
  const dashboard = await getPitchDashboard(catalog.brandSlug);

  return NextResponse.json({ catalog, dashboard });
}

export async function POST(req: NextRequest) {
  if (!hasValidFrontrunnerDemoSession(req.cookies.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value)) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const seedRequest = seedCatalogRequestSchema.safeParse(body);
    if (seedRequest.success) {
      const catalog = await importPitchCatalog({
        ...PITCH_DEMO_CATALOG,
        importedAt: new Date().toISOString(),
      });
      const dashboard = await getPitchDashboard(catalog.brandSlug);
      return NextResponse.json({ catalog, dashboard });
    }

    const parsed = csvImportRequestSchema.parse(body);
    const catalog = normalizePartnerCsv(parsed);
    const storedCatalog = await importPitchCatalog(catalog);
    const dashboard = await getPitchDashboard(storedCatalog.brandSlug);

    return NextResponse.json({ catalog: storedCatalog, dashboard });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }

    const message = error instanceof Error ? error.message : "Catalog import failed";
    return NextResponse.json({ error: "catalog_import_failed", message }, { status: 422 });
  }
}
