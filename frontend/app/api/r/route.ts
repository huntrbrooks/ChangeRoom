import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedRedirectUrl } from "@/lib/affiliateLinks";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/r?offerId=...        (preferred) redirect to a saved offer's stored URL
 * GET /api/r?url=...            redirect to a known retailer / affiliate network only
 *
 * Redirect tracking route for affiliate links: logs the click, then redirects.
 * Arbitrary destinations are refused so this can't be used as an open redirect.
 */
export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = checkRateLimit(`r:ip:${ip}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const searchParams = req.nextUrl.searchParams;
    const targetUrl = searchParams.get("url");
    const offerIdParam = searchParams.get("offerId");
    const offerId = offerIdParam && UUID_RE.test(offerIdParam) ? offerIdParam : null;
    const db = await import("@/lib/db-access");

    let destination: string | null = null;
    if (offerId) {
      const offer = await db.getClothingItemOfferUrls(offerId);
      const stored = offer?.affiliate_url || offer?.product_url || null;
      if (stored && /^https?:\/\//i.test(stored)) {
        destination = stored;
      }
    }

    if (!destination && targetUrl) {
      // searchParams.get() already percent-decodes the value.
      if (!isAllowedRedirectUrl(targetUrl)) {
        return NextResponse.json({ error: "Redirect destination not allowed" }, { status: 400 });
      }
      destination = targetUrl;
    }

    if (!destination) {
      return NextResponse.json({ error: "Missing or unknown offerId/url" }, { status: 400 });
    }

    // Get user ID if authenticated (optional)
    const { userId } = await auth();

    // Log the click (fire and forget - don't block redirect)
    db.logAffiliateClick({
      offerId,
      userId: userId || null,
      clickedUrl: destination,
    }).catch((err) => {
      console.error("Error logging affiliate click:", err);
      // Don't fail the redirect if logging fails
    });

    return NextResponse.redirect(destination, { status: 302 });
  } catch (err: unknown) {
    console.error("Redirect error:", err);
    return NextResponse.json({ error: "Redirect failed" }, { status: 500 });
  }
}
