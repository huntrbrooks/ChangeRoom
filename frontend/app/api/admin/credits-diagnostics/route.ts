import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCreditDiagnostics } from "@/lib/db-access";

// Admin users who can access diagnostics
const ADMIN_EMAILS = [
  "admin@igetdressed.online",
  "gerard@igetdressed.online",
  "gerardgrenville@gmail.com",
];

const getAdminAuth = async (request: NextRequest) => {
  const apiKey = request.headers.get("x-api-key");
  const expectedApiKey = process.env.ADMIN_API_KEY;

  if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
    return { authorized: true, adminEmail: "api-key" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { authorized: false, adminEmail: null };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress || "";
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
    return { authorized: true, adminEmail: email };
  }

  return { authorized: false, adminEmail: email || null };
};

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
