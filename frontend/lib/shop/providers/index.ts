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

/**
 * Find best offers for a search query across all providers
 * Returns offers sorted by total price (cheapest first)
 */
export async function findBestOffersForQuery(
  query: string,
  ctx: ProviderContext
): Promise<Offer[]> {
  const allOffers: Offer[] = [];

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

  // Sort by total price (cheapest first)
  filtered.sort((a, b) => a.totalPrice - b.totalPrice);

  return filtered;
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
  description?: string | null;
}): string {
  const parts: string[] = [];

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

