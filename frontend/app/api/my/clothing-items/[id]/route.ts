import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAbsoluteUrl } from "@/lib/url";

/**
 * PATCH /api/my/clothing-items/[id]
 * Update a user's clothing item metadata/description.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const clothingItemId = resolvedParams.id;

  if (!clothingItemId) {
    return NextResponse.json({ error: "Missing clothing item ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates = body as {
    description?: string | null;
    category?: string | null;
    subcategory?: string | null;
    color?: string | null;
    style?: string | null;
    brand?: string | null;
    tags?: string[] | null;
    wearing_style?: string | null;
  };

  const hasUpdateField = [
    "description",
    "category",
    "subcategory",
    "color",
    "style",
    "brand",
    "tags",
    "wearing_style",
  ].some((key) => key in updates);

  if (!hasUpdateField) {
    return NextResponse.json({ error: "No updates supplied" }, { status: 400 });
  }

  try {
    const { updateClothingItem } = await import("@/lib/db-access");
    const updated = await updateClothingItem(userId, clothingItemId, updates);

    if (!updated) {
      return NextResponse.json(
        { error: "Clothing item not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      clothingItem: {
        ...updated,
        public_url: ensureAbsoluteUrl(updated.public_url) || updated.public_url,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to update clothing item:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
