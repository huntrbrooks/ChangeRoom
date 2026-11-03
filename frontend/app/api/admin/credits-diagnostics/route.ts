import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getAdminAuth } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCreditDiagnostics } from "@/lib/db-access";



export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = checkRateLimit(`credits-diagnostics:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const admin = await getAdminAuth(request);
    if (!admin.authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const userIdParam = url.searchParams.get("userId")?.trim();
    const emailParam = url.searchParams.get("email")?.trim();
    const entryLimit = Number.parseInt(url.searchParams.get("entryLimit") || "25", 10);
    const holdLimit = Number.parseInt(url.searchParams.get("holdLimit") || "20", 10);

    let targetUserId = userIdParam || "";

    if (!targetUserId && emailParam) {
      const client = await clerkClient();
      const users = await client.users.getUserList({
        emailAddress: [emailParam],
        limit: 1,
      });
      if (users.data.length === 0) {
        return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      }
      targetUserId = users.data[0].id;
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: "userId_or_email_required" },
        { status: 400 }
      );
    }

    const diagnostics = await getCreditDiagnostics(targetUserId, {
      entryLimit,
      holdLimit,
    });

    return NextResponse.json(
      {
        ok: true,
        diagnostics,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("credits-diagnostics error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown diagnostics error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
