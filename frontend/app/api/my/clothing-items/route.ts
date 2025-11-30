import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserClothingItems } from "@/lib/db-access";

/**
 * GET /api/my/clothing-items
 * Fetch user's clothing items
 * Query params: category, tags (comma-separated), limit
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam ? tagsParam.split(",") : undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const clothingItems = await getUserClothingItems(userId, {
      category,
      tags,
      limit,
    });

    return NextResponse.json({ clothingItems });
  } catch (err: unknown) {
    console.error("get clothing-items error:", err);
    return NextResponse.json(
      { error: "Failed to fetch clothing items" },
      { status: 500 }
    );
  }
}

