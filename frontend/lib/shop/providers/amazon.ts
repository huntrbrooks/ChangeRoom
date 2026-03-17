/**
 * Amazon AU provider using Amazon Product Advertising API (PA API)
 * Requires AMAZON_ASSOCIATE_TAG_AU
 * 
 * Note: This is a placeholder implementation. You'll need to:
 * 1. Sign up for Amazon Associates AU
 * 2. Get PA API credentials (Access Key, Secret Key, Partner Tag)
 * 3. Implement PA API 5.0 requests (requires signing)
 */

import type { ShopProvider, Offer, ProviderContext } from "./types";

export const amazonProvider: ShopProvider = {
  id: "amazon",
  
  async fetchOffers(_query: string, _ctx: ProviderContext): Promise<Offer[]> {
    const associateTag = process.env.AMAZON_ASSOCIATE_TAG_AU;
    if (!associateTag) {
      console.warn("AMAZON_ASSOCIATE_TAG_AU not set. Amazon provider will return empty results.");
      return [];
    }

    // TODO: Implement Amazon PA API 5.0
    // This requires:
    // - Access Key ID (AMAZON_ACCESS_KEY_ID)
    // - Secret Access Key (AMAZON_SECRET_ACCESS_KEY)
    // - Partner Tag (AMAZON_ASSOCIATE_TAG_AU)
    // - Marketplace: www.amazon.com.au
    // - PA API signing (HMAC-SHA256)
    
    console.warn("Amazon provider not yet implemented. Returning empty results.");
    return [];
  },
};

