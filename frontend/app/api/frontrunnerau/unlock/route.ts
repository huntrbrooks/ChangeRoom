import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
