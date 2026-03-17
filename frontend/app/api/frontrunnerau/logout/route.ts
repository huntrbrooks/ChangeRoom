import { NextRequest, NextResponse } from "next/server";

import {
  FRONTRUNNER_DEMO_COOKIE_NAME,
  getFrontrunnerDemoCookieOptions,
} from "@/lib/frontrunnerDemoAccess";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/frontrunnerau", request.url), 303);
  response.cookies.set(FRONTRUNNER_DEMO_COOKIE_NAME, "", {
    ...getFrontrunnerDemoCookieOptions(),
    maxAge: 0,
  });
  return response;
}
