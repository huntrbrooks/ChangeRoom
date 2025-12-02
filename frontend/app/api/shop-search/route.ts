import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { findBestOffersForQuery, buildSearchQueryFromItem } from "@/lib/shop/providers";
import { getClothingItemsByIds, upsertClothingItemOffers, getClothingItemOffers } from "@/lib/db-access";

/**
 * POST /api/shop-search
 * Search for products/offers for one or more clothing items
 * 
 * Body: { clothingItemIds: string[] }
 * 
 * Returns: { offers: Offer[] } grouped by clothing item
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { clothingItemIds } = body as { clothingItemIds: string[] };

    if (!clothingItemIds || !Array.isArray(clothingItemIds) || clothingItemIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid clothingItemIds" },
        { status: 400 }
      );
    }

    // Fetch clothing items (scoped to user)
    const clothingItems = await getClothingItemsByIds(userId, clothingItemIds);
    if (clothingItems.length === 0) {
      return NextResponse.json(
        { error: "No clothing items found" },
        { status: 404 }
      );
    }

    // Context: Australia first
    const ctx = { country: "AU" as const, currency: "AUD" as const };

    // Search for offers for each item
    const results: Record<string, any[]> = {};

    for (const item of clothingItems) {
      // Build search query from item metadata
      const query = buildSearchQueryFromItem({
        category: item.category,
        subcategory: item.subcategory,
        color: item.color,
        style: item.style,
        description: item.description,
      });

      // Fetch offers from all providers
      const offers = await findBestOffersForQuery(query, ctx);

      // Store top 5 offers per item
      const topOffers = offers.slice(0, 5);

      // Save to database
      if (topOffers.length > 0) {
        await upsertClothingItemOffers(
          item.id,
          topOffers.map((offer) => ({
            source: offer.source,
            merchant: offer.merchant,
            title: offer.title,
            price: offer.price,
            currency: offer.currency,
            productUrl: offer.productUrl,
            affiliateUrl: offer.affiliateUrl,
            thumbnailUrl: offer.thumbnailUrl,
            shippingPrice: offer.shippingPrice,
            totalPrice: offer.totalPrice,
          }))
        );
      }

      // Format for response
      results[item.id] = topOffers.map((offer) => ({
        id: offer.source, // Temporary ID, will be replaced with DB ID if needed
        source: offer.source,
        merchant: offer.merchant,
        title: offer.title,
        price: offer.price,
        currency: offer.currency,
        productUrl: offer.productUrl,
        affiliateUrl: offer.affiliateUrl,
        thumbnailUrl: offer.thumbnailUrl,
        shippingPrice: offer.shippingPrice,
        totalPrice: offer.totalPrice,
      }));
    }

    return NextResponse.json({
      offers: results,
    });
  } catch (err: unknown) {
    console.error("shop-search error:", err);
    const error = err instanceof Error ? err : new Error(String(err));

    return NextResponse.json(
      {
        error: "Shop search failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/shop-search?clothingItemId=...
 * Get previously searched offers for a clothing item
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const clothingItemId = searchParams.get("clothingItemId");

    if (!clothingItemId) {
      return NextResponse.json(
        { error: "Missing clothingItemId parameter" },
        { status: 400 }
      );
    }

    // Get offers from database
    const offers = await getClothingItemOffers(userId, clothingItemId, 10);

    return NextResponse.json({
      offers: offers.map((offer) => ({
        id: offer.id,
        source: offer.source,
        merchant: offer.merchant,
        title: offer.title,
        price: Number(offer.price),
        currency: offer.currency,
        productUrl: offer.product_url,
        affiliateUrl: offer.affiliate_url,
        thumbnailUrl: offer.thumbnail_url,
        shippingPrice: offer.shipping_price ? Number(offer.shipping_price) : null,
        totalPrice: Number(offer.total_price),
      })),
    });
  } catch (err: unknown) {
    console.error("shop-search GET error:", err);
    const error = err instanceof Error ? err : new Error(String(err));

    return NextResponse.json(
      {
        error: "Failed to fetch offers",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

