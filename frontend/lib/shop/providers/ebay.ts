/**
 * eBay AU provider using eBay Browse API
 * Requires EBAY_OAUTH_TOKEN, EBAY_CAMPAIGN_ID (and optionally EBAY_CUSTOM_ID)
 * 
 * Note: This is a placeholder implementation. You'll need to:
 * 1. Set up eBay OAuth token (see eBay Developer docs)
 * 2. Join eBay Partner Network to get campaign ID
 * 3. Implement proper OAuth token refresh if needed
 */

import type { ShopProvider, Offer, ProviderContext } from "./types";

/**
 * Build eBay affiliate URL with Partner Network tracking
 */
function buildEbayAffiliateUrl(rawUrl: string): string {
  const campaignId = process.env.EBAY_CAMPAIGN_ID;
  if (!campaignId) {
    return rawUrl; // No affiliate tracking if not configured
  }

  try {
    const url = new URL(rawUrl);
    url.searchParams.set("campid", campaignId);
    
    const customId = process.env.EBAY_CUSTOM_ID;
    if (customId) {
      url.searchParams.set("customid", customId);
    }
    
    return url.toString();
  } catch (err) {
    console.error("Error building eBay affiliate URL:", err);
    return rawUrl;
  }
}

export const ebayProvider: ShopProvider = {
  id: "ebay",
  
  async fetchOffers(query: string, ctx: ProviderContext): Promise<Offer[]> {
    const token = process.env.EBAY_OAUTH_TOKEN;
    if (!token) {
      console.warn("EBAY_OAUTH_TOKEN not set. eBay provider will return empty results.");
      return [];
    }

    try {
      const marketplaceId = "EBAY_AU";
      const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "10");
      url.searchParams.set("marketplace_id", marketplaceId);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`eBay API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const items = data.itemSummaries || [];

      const offers: Offer[] = [];

      for (const item of items) {
        try {
          const price = Number(item.price?.value ?? 0);
          const currency = item.price?.currency ?? "AUD";
          
          // Skip if not AUD or invalid price
          if (currency !== ctx.currency || price <= 0) {
            continue;
          }

          const shipping = item.shippingOptions?.[0]?.shippingCost?.value
            ? Number(item.shippingOptions[0].shippingCost.value)
            : 0;

          const productUrl = item.itemWebUrl as string;
          if (!productUrl) {
            continue;
          }

          const offer: Offer = {
            source: "ebay",
            merchant: "eBay",
            title: item.title || "Untitled",
            price,
            currency,
            productUrl,
            affiliateUrl: buildEbayAffiliateUrl(productUrl),
            thumbnailUrl: item.image?.imageUrl || undefined,
            shippingPrice: shipping > 0 ? shipping : null,
            totalPrice: price + shipping,
          };

          offers.push(offer);
        } catch (itemError) {
          console.warn("Error parsing eBay item:", itemError);
          continue;
        }
      }

      // Sort by total price
      return offers.sort((a, b) => a.totalPrice - b.totalPrice);
    } catch (err) {
      console.error("Error fetching eBay offers:", err);
      return [];
    }
  },
};

