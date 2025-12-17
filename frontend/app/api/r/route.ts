import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { logAffiliateClick } from "@/lib/db-access";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/r?url=...
 * Redirect tracking route for affiliate links
 * Logs the click and redirects to the target URL
 * 
 * This allows you to track which offers are clicked most often
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
    const offerId = searchParams.get("offerId");

    if (!targetUrl) {
      return NextResponse.json(
        { error: "Missing url parameter" },
        { status: 400 }
      );
    }

    // Decode the target URL
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(targetUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid url parameter" },
        { status: 400 }
      );
    }

    // Validate URL + restrict protocols (avoid non-http(s) open redirects)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Invalid URL protocol" },
        { status: 400 }
      );
    }

    // Get user ID if authenticated (optional)
    const { userId } = await auth();

    // Log the click (fire and forget - don't block redirect)
    logAffiliateClick({
      offerId: offerId || null,
      userId: userId || null,
      clickedUrl: decodedUrl,
    }).catch((err) => {
      console.error("Error logging affiliate click:", err);
      // Don't fail the redirect if logging fails
    });

    // Redirect to target URL
    return NextResponse.redirect(decodedUrl, { status: 302 });
  } catch (err: unknown) {
    console.error("Redirect error:", err);
    const error = err instanceof Error ? err : new Error(String(err));

    return NextResponse.json(
      {
        error: "Redirect failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

