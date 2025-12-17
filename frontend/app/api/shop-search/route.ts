import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { findBestOffersForQuery, buildSearchQueryFromItem } from "@/lib/shop/providers";
import { getClothingItemsByIds, upsertClothingItemOffers, getClothingItemOffers } from "@/lib/db-access";
import { checkRateLimit } from "@/lib/rate-limit";

type DbClothingItem = Awaited<ReturnType<typeof getClothingItemsByIds>>[number];

/**
 * POST /api/shop-search
 * Search for products/offers for one or more clothing items
 * 
 * Body: { clothingItemIds: string[] }
 * 
 * Returns: { offers: Offer[] } grouped by clothing item
 */
interface ItemMetadataInput {
  id: string;
  category?: string | null;
  subcategory?: string | null;
  color?: string | null;
  style?: string | null;
  brand?: string | null;
  description?: string | null;
  tags?: string[] | null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`shop-search:user:${userId}`, 30, 60_000);
    const rlIp = checkRateLimit(`shop-search:ip:${ip}`, 60, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

    const startedAt = Date.now();
    const body = await req.json();
    const { clothingItemIds, itemMetadata } = body as {
      clothingItemIds: string[];
      itemMetadata?: ItemMetadataInput[];
    };

    if (!clothingItemIds || !Array.isArray(clothingItemIds) || clothingItemIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid clothingItemIds" },
        { status: 400 }
      );
    }

    const fallbackMap = new Map(
      (itemMetadata || [])
        .filter((meta): meta is ItemMetadataInput => Boolean(meta?.id))
        .map((meta) => [meta.id, meta])
    );

    let clothingItems: DbClothingItem[] = [];
    try {
      clothingItems = await getClothingItemsByIds(userId, clothingItemIds);
    } catch (err) {
      console.warn("getClothingItemsByIds failed, falling back to provided metadata", err);
    }

    if (clothingItems.length === 0 && fallbackMap.size === 0) {
      return NextResponse.json(
        { error: "No clothing items found" },
        { status: 404 }
      );
    }

    const itemsToSearch: Array<DbClothingItem | ItemMetadataInput> = clothingItemIds
      .map((id) => clothingItems.find((item) => item.id === id) || fallbackMap.get(id))
      .filter((item): item is DbClothingItem | ItemMetadataInput => Boolean(item));

    const isDatabaseItem = (item: DbClothingItem | ItemMetadataInput): item is DbClothingItem => {
      return "user_id" in item;
    };

    // Context: Australia first
    const ctx = { country: "AU" as const, currency: "AUD" as const };

    // Search for offers for each item
    type OfferResult = {
      id: string;
      source: string;
      merchant: string;
      title: string;
      price: number;
      currency: string;
      productUrl: string;
      affiliateUrl: string | null;
      thumbnailUrl: string | null;
      shippingPrice: number | null;
      totalPrice: number | null;
    };

    const results: Record<string, OfferResult[]> = {};

    for (const item of itemsToSearch) {
      // Build search query from item metadata
      const query = buildSearchQueryFromItem({
        category: item.category,
        subcategory: item.subcategory,
        color: item.color,
        style: item.style,
        brand: item.brand,
        description: item.description,
        tags: item.tags,
      });

      // Fetch offers from all providers
      const offers = await findBestOffersForQuery(query, ctx);

      // Store top 5 offers per item
      const topOffers = offers.slice(0, 5);

      // Save to database
      if (topOffers.length > 0 && isDatabaseItem(item)) {
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
      const mapKey = item.id || "";
      results[mapKey] = topOffers.map((offer) => ({
        id: offer.source, // Temporary ID, will be replaced with DB ID if needed
        source: offer.source,
        merchant: offer.merchant,
        title: offer.title,
        price: offer.price,
        currency: offer.currency,
        productUrl: offer.productUrl,
        affiliateUrl: offer.affiliateUrl ?? null,
        thumbnailUrl: offer.thumbnailUrl ?? null,
        shippingPrice: offer.shippingPrice ?? null,
        totalPrice: offer.totalPrice ?? null,
      }));
    }

    const response = NextResponse.json({
      offers: results,
    });
    console.info("shop-search durationMs", {
      durationMs: Date.now() - startedAt,
      itemCount: itemsToSearch.length,
    });
    return response;
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
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rlUser = checkRateLimit(`shop-search-get:user:${userId}`, 60, 60_000);
    const rlIp = checkRateLimit(`shop-search-get:ip:${ip}`, 120, 60_000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: 60_000 },
        { status: 429 }
      );
    }

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

