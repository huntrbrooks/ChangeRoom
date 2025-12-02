/**
 * Google Shopping provider using SerpAPI
 * Configured for Australia (gl=au, hl=en)
 */

import type { ShopProvider, Offer, ProviderContext } from "./types";

/**
 * Parse price string from SerpAPI (e.g., "$45.99", "A$29.95", "29.95 AUD")
 * Returns price in AUD as a number
 */
function parsePrice(priceStr: string | undefined): number {
  if (!priceStr) return 0;
  
  // Remove currency symbols and text, keep numbers and decimal point
  const cleaned = priceStr.replace(/[^\d.,]/g, "");
  // Replace comma with dot if it's a decimal separator
  const normalized = cleaned.replace(",", ".");
  const parsed = parseFloat(normalized);
  
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Wrap URL with redirect tracking if SHOP_REDIRECT_BASE_URL is set
 */
function buildAffiliateUrl(productUrl: string): string {
  const redirectBase = process.env.SHOP_REDIRECT_BASE_URL;
  if (!redirectBase) {
    return productUrl;
  }

  try {
    const redirectUrl = new URL(redirectBase);
    redirectUrl.searchParams.set("url", encodeURIComponent(productUrl));
    return redirectUrl.toString();
  } catch (err) {
    console.error("Error building affiliate URL:", err);
    return productUrl;
  }
}

export const googleShoppingProvider: ShopProvider = {
  id: "google_shopping",
  
  async fetchOffers(query: string, ctx: ProviderContext): Promise<Offer[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      console.warn("SERPAPI_API_KEY not set. Google Shopping provider will return empty results.");
      return [];
    }

    try {
      const params = new URLSearchParams({
        engine: "google_shopping",
        q: query,
        api_key: apiKey,
        num: "10", // Get more results to filter
        gl: "au", // Australia
        hl: "en", // English
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        console.error(`SerpAPI error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const shoppingResults = data.shopping_results || [];

      if (shoppingResults.length === 0) {
        return [];
      }

      const offers: Offer[] = [];

      for (const item of shoppingResults) {
        try {
          const price = parsePrice(item.price);
          const shippingPrice = item.shipping ? parsePrice(item.shipping) : null;
          const productUrl = item.link || item.product_link || "#";
          
          // Skip if no valid price or URL
          if (price <= 0 || !productUrl || productUrl === "#") {
            continue;
          }

          const offer: Offer = {
            source: "google_shopping",
            merchant: item.source || "Unknown",
            title: item.title || "Untitled",
            price,
            currency: ctx.currency,
            productUrl,
            affiliateUrl: buildAffiliateUrl(productUrl),
            thumbnailUrl: item.thumbnail || undefined,
            shippingPrice,
            totalPrice: price + (shippingPrice || 0),
          };

          offers.push(offer);
        } catch (itemError) {
          console.warn("Error parsing shopping result item:", itemError);
          continue;
        }
      }

      // Filter to AUD only and sort by total price
      return offers
        .filter((o) => o.currency === ctx.currency && o.totalPrice > 0)
        .sort((a, b) => a.totalPrice - b.totalPrice);
    } catch (err) {
      console.error("Error fetching Google Shopping offers:", err);
      return [];
    }
  },
};

