import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getUserClothingItems,
  getUserPersonImages,
} from "@/lib/db-access";

// GET /api/wardrobe - Fetch user's clothing items and person images
export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [clothingItems, personImages] = await Promise.all([
      getUserClothingItems(userId),
      getUserPersonImages(userId),
    ]);

    return NextResponse.json({
      clothingItems,
      personImages,
    });
  } catch (err: any) {
    console.error("wardrobe fetch error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch wardrobe",
      },
      { status: 500 }
    );
  }
}

