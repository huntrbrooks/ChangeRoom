import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { ClothingItemMetadata } from "@/lib/db-access";
import { getUserPrimaryEmail } from "@/lib/bypass-config";

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
    const {
      getEffectiveUserBilling,
      getUserOutfits,
      hasPaidCreditGrant,
      upsertUserProfileFromClerk,
    } = await import(
      "@/lib/db-access"
    );
    let userEmail: string | null = null;
    try {
      const user = await currentUser();
      userEmail = getUserPrimaryEmail(user);
      if (user) {
        await upsertUserProfileFromClerk({
          userId,
          email: userEmail,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          imageUrl: user.imageUrl || null,
          clerkCreatedAt: user.createdAt || null,
        });
      }
    } catch (profileErr) {
      console.warn("outfits: failed to sync Clerk user profile", profileErr);
    }

    const { billing, isPrivileged } = await getEffectiveUserBilling(userId, userEmail);
    const hasPurchase =
      isPrivileged || billing.plan !== "free" || (await hasPaidCreditGrant(userId));
    // Gate access until a purchase/paid grant exists (credits alone not sufficient)
    if (!hasPurchase) {
      return NextResponse.json({
        upgradeRequired: true,
        outfits: [],
      });
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
    const { insertUserOutfit, getOrCreateUserBilling } = await import("@/lib/db-access");
    await getOrCreateUserBilling(userId);
    // Allow saving even if My Outfits viewing is gated; do not block on purchase

    const body = await req.json().catch(() => ({}));
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


