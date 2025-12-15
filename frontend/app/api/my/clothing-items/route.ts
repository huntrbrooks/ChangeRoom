import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getUserClothingItems,
  getSavedClothingItemIds,
  insertClothingItems,
} from "@/lib/db-access";
import { ensureAbsoluteUrl } from "@/lib/url";

type ClothingItemInput = {
  storageKey: string;
  publicUrl: string;
  category: string;
  subcategory: string | null;
  color: string | null;
  style: string | null;
  brand: string | null;
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
      .map((item: unknown) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;

        const storageKey =
          typeof record.storageKey === "string" ? record.storageKey.trim() : "";
        const publicUrl =
          typeof record.publicUrl === "string" ? record.publicUrl.trim() : "";
        const category =
          typeof record.category === "string" ? record.category : "unknown";
        const brand =
          typeof record.brand === "string" ? record.brand.trim() : null;
        const description =
          typeof record.description === "string" ? record.description : "";

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
            typeof record.subcategory === "string" ? record.subcategory : null,
          color: typeof record.color === "string" ? record.color : null,
          style: typeof record.style === "string" ? record.style : null,
          brand,
          description,
          tags: Array.isArray(record.tags)
            ? record.tags.filter(
                (tag: unknown): tag is string => typeof tag === "string"
              )
            : [],
          originalFilename:
            typeof record.originalFilename === "string"
              ? record.originalFilename
              : null,
          mimeType:
            typeof record.mimeType === "string" ? record.mimeType : null,
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

