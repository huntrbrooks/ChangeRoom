import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/rate-limit";

import {
  createFrontrunnerDemoSessionToken,
  FRONTRUNNER_DEMO_COOKIE_NAME,
  getFrontrunnerDemoCookieOptions,
  isValidFrontrunnerDemoPassword,
} from "@/lib/frontrunnerDemoAccess";

const passwordSchema = z.object({
  password: z.string().trim().min(1, "Password is required."),
});

function redirectToDemo(request: NextRequest, error?: string) {
  const url = new URL("/frontrunnerau", request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Slow down password guessing: 10 attempts per IP per 15 minutes.
  if (!checkRateLimit(`frontrunner-unlock:ip:${ip}`, 10, 15 * 60_000).allowed) {
    return redirectToDemo(request, "rate_limited");
  }

  const formData = await request.formData();
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success || !isValidFrontrunnerDemoPassword(parsed.data.password)) {
    return redirectToDemo(request, "invalid_password");
  }

  const response = redirectToDemo(request);
  response.cookies.set(
    FRONTRUNNER_DEMO_COOKIE_NAME,
    createFrontrunnerDemoSessionToken(),
    getFrontrunnerDemoCookieOptions()
  );
  return response;
}
