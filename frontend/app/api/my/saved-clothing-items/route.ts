import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSavedClothingItems,
  getSavedClothingItemIds,
  saveClothingItem,
  removeSavedClothingItem,
} from "@/lib/db-access";
import { ensureAbsoluteUrl } from "@/lib/url";

type SavedClothingItem = {
  public_url: string | null;
  [key: string]: unknown;
};

const normalizeItems = (items: Array<unknown>) =>
  items.map((item) => {
    const record = (item && typeof item === "object" ? item : {}) as SavedClothingItem;
    const normalizedPublicUrl =
      ensureAbsoluteUrl(record.public_url ?? null) ??
      (record.public_url ?? null);

    return {
      ...record,
      public_url: normalizedPublicUrl,
    };
  });

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const clothingItems = await getSavedClothingItems(userId, { limit });
    const savedIds = await getSavedClothingItemIds(userId);

    return NextResponse.json({
      clothingItems: normalizeItems(clothingItems),
      savedIds,
    });
  } catch (err: unknown) {
    console.error("saved clothing items GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch saved items" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clothingItemId =
      typeof body?.clothingItemId === "string" ? body.clothingItemId : "";

    if (!clothingItemId) {
      return NextResponse.json(
        { error: "clothingItemId is required" },
        { status: 400 }
      );
    }

    await saveClothingItem(userId, clothingItemId);

    return NextResponse.json({ saved: true, clothingItemId });
  } catch (err: unknown) {
    console.error("saved clothing items POST error:", err);
    return NextResponse.json(
      { error: "Failed to save item" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clothingItemId =
      typeof body?.clothingItemId === "string" ? body.clothingItemId : "";

    if (!clothingItemId) {
      return NextResponse.json(
        { error: "clothingItemId is required" },
        { status: 400 }
      );
    }

    await removeSavedClothingItem(userId, clothingItemId);

    return NextResponse.json({ removed: true, clothingItemId });
  } catch (err: unknown) {
    console.error("saved clothing items DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to remove item" },
      { status: 500 }
    );
  }
}


