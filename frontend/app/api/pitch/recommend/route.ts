import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { hasValidFrontrunnerDemoSession, FRONTRUNNER_DEMO_COOKIE_NAME } from "@/lib/frontrunnerDemoAccess";
import { getPitchProduct } from "@/lib/pitch/data";
import { recommendSizeForProduct } from "@/lib/pitch/recommend";
import { fitRecommendationRequestSchema } from "@/lib/pitch/schemas";

export async function POST(req: NextRequest) {
  if (!hasValidFrontrunnerDemoSession(req.cookies.get(FRONTRUNNER_DEMO_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "demo_access_required" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const parsed = fitRecommendationRequestSchema.parse(body);
    const product = await getPitchProduct(parsed.brandSlug, parsed.productId);

    if (!product) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }

    const recommendation = recommendSizeForProduct(product, parsed.profile);
    return NextResponse.json({ product, recommendation });
  } catch (error) {
    if (error instanceof ZodError) {
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

    const message = error instanceof Error ? error.message : "Recommendation failed";
    return NextResponse.json({ error: "recommendation_failed", message }, { status: 422 });
  }
}
