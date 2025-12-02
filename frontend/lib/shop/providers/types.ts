/**
 * Shop provider abstraction for affiliate monetized product search
 * Supports multiple providers (eBay AU, Amazon AU, Google Shopping)
 * with Australia-first strategy
 */

export type OfferSource = "ebay" | "amazon" | "google_shopping";

export interface Offer {
  source: OfferSource;
  merchant: string;
  title: string;
  price: number;
  currency: string;
  productUrl: string;
  affiliateUrl: string; // Already tagged affiliate link
  thumbnailUrl?: string;
  shippingPrice?: number | null;
  totalPrice: number; // price + shipping if known
}

export interface ProviderContext {
  country: "AU";
  currency: "AUD";
}

export interface ShopProvider {
  id: OfferSource;
  fetchOffers(query: string, ctx: ProviderContext): Promise<Offer[]>;
}

