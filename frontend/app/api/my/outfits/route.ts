import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { insertUserOutfit, getUserOutfits, type ClothingItemMetadata } from "@/lib/db-access";

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
    const outfits = await getUserOutfits(userId);
    
    // Transform to match frontend format
    const formattedOutfits = outfits.map(outfit => ({
      id: outfit.id,
      imageUrl: outfit.image_url,
      clothingItems: outfit.clothing_items,
      createdAt: outfit.created_at.toISOString(),
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
    const body = await req.json();
    const { imageUrl, clothingItems } = body;

    if (!imageUrl || !Array.isArray(clothingItems)) {
      return NextResponse.json(
        { error: "Missing required fields: imageUrl and clothingItems" },
        { status: 400 }
      );
    }

    // Validate clothing items structure
    const validClothingItems: ClothingItemMetadata[] = clothingItems.map((item: any) => ({
      filename: item.filename || '',
      category: item.category || 'unknown',
      itemType: item.itemType || '',
      color: item.color || '',
      style: item.style || '',
      description: item.description || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      fileUrl: item.fileUrl || null,
    }));

    const outfit = await insertUserOutfit(userId, {
      imageUrl,
      clothingItems: validClothingItems,
    });

    // Transform to match frontend format
    const formattedOutfit = {
      id: outfit.id,
      imageUrl: outfit.image_url,
      clothingItems: outfit.clothing_items,
      createdAt: outfit.created_at.toISOString(),
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


