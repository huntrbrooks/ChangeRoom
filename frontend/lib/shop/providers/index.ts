/**
 * Shop provider orchestrator
 * Aggregates offers from all providers and returns best matches
 */

import type { Offer, ProviderContext } from "./types";
import { googleShoppingProvider } from "./googleShopping";
import { ebayProvider } from "./ebay";
import { amazonProvider } from "./amazon";

// Provider priority: eBay and Amazon first (better affiliate rates), then Google Shopping as fallback
const providers = [ebayProvider, amazonProvider, googleShoppingProvider];

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreOfferRelevance(offer: Offer, tokens: string[]): number {
  const title = (offer.title || "").toLowerCase();
  const merchant = (offer.merchant || "").toLowerCase();

  return tokens.reduce((score, token) => {
    let next = score;
    if (title.includes(token)) {
      next += 3;
    }
    if (merchant.includes(token)) {
      next += 1;
    }
    if (offer.thumbnailUrl) {
      next += 0.5;
    }
    return next;
  }, 0);
}

/**
 * Find best offers for a search query across all providers
 * Returns offers sorted by relevance to the query (ties broken by total price)
 */
export async function findBestOffersForQuery(
  query: string,
  ctx: ProviderContext
): Promise<Offer[]> {
  const allOffers: Offer[] = [];
  const tokens = tokenize(query);

  // Fetch from all providers in parallel
  const providerPromises = providers.map(async (provider) => {
    try {
      const offers = await provider.fetchOffers(query, ctx);
      return offers;
    } catch (err) {
      console.error(`Provider ${provider.id} failed:`, err);
      return [];
    }
  });

  const results = await Promise.all(providerPromises);
  
  // Flatten results
  for (const offers of results) {
    allOffers.push(...offers);
  }

  // Filter: only AUD, valid prices
  const filtered = allOffers.filter(
    (o) => o.currency === ctx.currency && o.totalPrice > 0
  );

  // Deduplicate by product URL
  const seenUrls = new Set<string>();
  const deduped: Offer[] = [];
  for (const offer of filtered) {
    const key = (offer.productUrl || "").toLowerCase();
    if (!key || seenUrls.has(key)) {
      continue;
    }
    seenUrls.add(key);
    deduped.push(offer);
  }

  // Sort by relevance to the query, then by total price
  const scored = deduped
    .map((offer) => ({
      offer,
      score: scoreOfferRelevance(offer, tokens),
    }))
    .sort((a, b) => b.score - a.score || a.offer.totalPrice - b.offer.totalPrice);

  return scored.map((entry) => entry.offer);
}

/**
 * Build a search query from clothing item metadata
 * Uses category, color, style, and description to create a focused query
 */
export function buildSearchQueryFromItem(item: {
  category?: string | null;
  subcategory?: string | null;
  color?: string | null;
  style?: string | null;
  brand?: string | null;
  description?: string | null;
  tags?: string[] | null;
}): string {
  const parts: string[] = [];

  // Brand first if we have a confident guess
  if (item.brand && item.brand.toLowerCase() !== "unknown" && item.brand.toLowerCase() !== "unbranded") {
    parts.push(item.brand);
  }

  // Add category/subcategory
  if (item.subcategory) {
    parts.push(item.subcategory);
  } else if (item.category) {
    parts.push(item.category);
  }

  // Add color
  if (item.color) {
    parts.push(item.color);
  }

  // Add style if relevant
  if (item.style) {
    parts.push(item.style);
  }

  if (item.tags && item.tags.length > 0) {
    parts.push(...item.tags.slice(0, 3));
  }

  // If we have a description, try to extract key terms
  if (item.description) {
    // Simple extraction: take first few words from description
    const descWords = item.description.split(/\s+/).slice(0, 3);
    parts.push(...descWords);
  }

  // Fallback if nothing
  if (parts.length === 0) {
    return "clothing";
  }

  return parts.join(" ");
}

