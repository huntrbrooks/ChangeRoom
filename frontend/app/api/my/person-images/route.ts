import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPersonImages } from "@/lib/db-access";

/**
 * GET /api/my/person-images
 * Fetch user's person images
 */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const personImages = await getUserPersonImages(userId);
    return NextResponse.json({ personImages });
  } catch (err: unknown) {
    console.error("get person-images error:", err);
    return NextResponse.json(
      { error: "Failed to fetch person images" },
      { status: 500 }
    );
  }
}

