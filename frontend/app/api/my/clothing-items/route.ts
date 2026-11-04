import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAbsoluteUrl } from "@/lib/url";

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
    const { getUserClothingItems, getSavedClothingItemIds } = await import("@/lib/db-access");
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam ? tagsParam.split(",") : undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const sinceParam = searchParams.get("sinceHours");
    const includeSaved = searchParams.get("includeSaved") === "true";

    const since =
      sinceParam && !Number.isNaN(Number(sinceParam))
        ? new Date(Date.now() - Number(sinceParam) * 60 * 60 * 1000)
        : undefined;

    const clothingItems = await getUserClothingItems(userId, {
      category,
      tags,
      limit,
      since,
    });

    const normalizedItems = clothingItems.map((item) => ({
      ...item,
      public_url: ensureAbsoluteUrl(item.public_url) || item.public_url,
    }));

    const savedIds = includeSaved
      ? await getSavedClothingItemIds(userId)
      : undefined;

    return NextResponse.json({ clothingItems: normalizedItems, savedIds });
  } catch (err: unknown) {
    console.error("get clothing-items error:", err);
    return NextResponse.json(
      { error: "Failed to fetch clothing items" },
      { status: 500 }
    );
  }
}


export function POST() {
  return NextResponse.json({ error: 'persistent_uploads_disabled' }, { status: 410 });
}
