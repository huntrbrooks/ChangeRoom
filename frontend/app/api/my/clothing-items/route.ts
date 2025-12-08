import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserClothingItems, insertClothingItems } from "@/lib/db-access";
import { ensureAbsoluteUrl } from "@/lib/url";

type ClothingItemInput = {
  storageKey: string;
  publicUrl: string;
  category: string;
  subcategory: string | null;
  color: string | null;
  style: string | null;
  description: string;
  tags: string[];
  originalFilename: string | null;
  mimeType: string | null;
};

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

    const normalizedItems = clothingItems.map((item) => ({
      ...item,
      public_url: ensureAbsoluteUrl(item.public_url) || item.public_url,
    }));

    return NextResponse.json({ clothingItems: normalizedItems });
  } catch (err: unknown) {
    console.error("get clothing-items error:", err);
    return NextResponse.json(
      { error: "Failed to fetch clothing items" },
      { status: 500 }
    );
  }
}


/**
 * POST /api/my/clothing-items
 * Save analyzed wardrobe items for the current user.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ clothingItems: [] });
    }

    const normalized: ClothingItemInput[] = items
      .map((item: any) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const storageKey =
          typeof item.storageKey === "string" ? item.storageKey.trim() : "";
        const publicUrl =
          typeof item.publicUrl === "string" ? item.publicUrl.trim() : "";
        const category =
          typeof item.category === "string" ? item.category : "unknown";
        const description =
          typeof item.description === "string" ? item.description : "";

        if (!storageKey || !publicUrl) {
          return null;
        }

        const normalizedPublicUrl =
          ensureAbsoluteUrl(publicUrl) || publicUrl;

        return {
          storageKey,
          publicUrl: normalizedPublicUrl,
          category,
          subcategory:
            typeof item.subcategory === "string" ? item.subcategory : null,
          color: typeof item.color === "string" ? item.color : null,
          style: typeof item.style === "string" ? item.style : null,
          description,
          tags: Array.isArray(item.tags)
            ? item.tags.filter(
                (tag: unknown): tag is string => typeof tag === "string"
              )
            : [],
          originalFilename:
            typeof item.originalFilename === "string"
              ? item.originalFilename
              : null,
          mimeType:
            typeof item.mimeType === "string" ? item.mimeType : null,
        };
      })
      .filter(
        (item: ClothingItemInput | null): item is ClothingItemInput =>
          item !== null
      );

    if (normalized.length === 0) {
      return NextResponse.json({ clothingItems: [] });
    }

    const saved = await insertClothingItems(userId, normalized);
    const normalizedSaved = saved.map((item) => ({
      ...item,
      public_url: ensureAbsoluteUrl(item.public_url) || item.public_url,
    }));

    return NextResponse.json({ clothingItems: normalizedSaved });
  } catch (err: unknown) {
    console.error("save clothing-items error:", err);
    return NextResponse.json(
      { error: "Failed to save clothing items" },
      { status: 500 }
    );
  }
}

