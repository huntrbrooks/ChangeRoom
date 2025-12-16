import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  insertUserOutfit,
  getUserOutfits,
  getOrCreateUserBilling,
  hasPaidCreditGrant,
  type ClothingItemMetadata,
} from "@/lib/db-access";

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Fallback to current time to avoid runtime errors
  return new Date().toISOString();
};

const normalizeClothingItems = (items: unknown): ClothingItemMetadata[] => {
  if (!items) {
    return [];
  }

  if (Array.isArray(items)) {
    return items as ClothingItemMetadata[];
  }

  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as ClothingItemMetadata[]) : [];
    } catch {
      return [];
    }
  }

  if (typeof items === "object" && items !== null) {
    return items as ClothingItemMetadata[];
  }

  return [];
};

/**
 * GET /api/my/outfits
 * Fetch user's saved outfits
 */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const billing = await getOrCreateUserBilling(userId);
    const hasCredits = (billing.credits_available ?? 0) > 0;
    const hasPurchase = billing.plan !== "free" || (await hasPaidCreditGrant(userId));
    const usedFreeTrial = billing.trial_used ?? false;

    if (usedFreeTrial && !hasCredits && !hasPurchase) {
      return NextResponse.json(
        { error: "upgrade_required" },
        { status: 402 }
      );
    }

    const outfits = await getUserOutfits(userId);
    
    // Transform to match frontend format
    const formattedOutfits = outfits.map(outfit => ({
      id: outfit.id,
      imageUrl: outfit.image_url,
      clothingItems: normalizeClothingItems(outfit.clothing_items),
      createdAt: toIsoString(outfit.created_at),
    }));

    return NextResponse.json(formattedOutfits);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error fetching outfits:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/my/outfits
 * Save a new outfit for the user
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const billing = await getOrCreateUserBilling(userId);
    const hasCredits = (billing.credits_available ?? 0) > 0;
    const hasPurchase = billing.plan !== "free" || (await hasPaidCreditGrant(userId));
    const usedFreeTrial = billing.trial_used ?? false;

    if (usedFreeTrial && !hasCredits && !hasPurchase) {
      return NextResponse.json(
        { error: "upgrade_required" },
        { status: 402 }
      );
    }

    const body = await req.json();
    const { imageUrl, clothingItems } = body;

    if (!imageUrl || !Array.isArray(clothingItems)) {
      return NextResponse.json(
        { error: "Missing required fields: imageUrl and clothingItems" },
        { status: 400 }
      );
    }

    // Validate clothing items structure
    const validClothingItems: ClothingItemMetadata[] = clothingItems.map((item: unknown) => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        filename: typeof record.filename === 'string' ? record.filename : '',
        category: typeof record.category === 'string' ? record.category : 'unknown',
        itemType: typeof record.itemType === 'string' ? record.itemType : '',
        color: typeof record.color === 'string' ? record.color : '',
        style: typeof record.style === 'string' ? record.style : '',
        description: typeof record.description === 'string' ? record.description : '',
        tags: Array.isArray(record.tags) ? record.tags : [],
        fileUrl: typeof record.fileUrl === 'string' ? record.fileUrl : null,
      };
    });

    const outfit = await insertUserOutfit(userId, {
      imageUrl,
      clothingItems: validClothingItems,
    });

    // Transform to match frontend format
    const formattedOutfit = {
      id: outfit.id,
      imageUrl: outfit.image_url,
      clothingItems: normalizeClothingItems(outfit.clothing_items),
      createdAt: toIsoString(outfit.created_at),
    };

    return NextResponse.json(formattedOutfit, { status: 201 });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error("Error saving outfit:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}



