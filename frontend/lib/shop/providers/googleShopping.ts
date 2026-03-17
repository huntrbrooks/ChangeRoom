/**
 * Google Shopping provider using SerpAPI
 * Configured for Australia-first (gl=au, hl=en) but overrideable via env vars
 */

import type { ShopProvider, Offer, ProviderContext } from "./types";

interface SerpShoppingResult {
  [key: string]: unknown;
  title?: string;
  source?: string;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  image?: string | { link?: string };
  price?: string;
  extracted_price?: number;
  currency?: string;
  shipping?: string;
  extracted_shipping_price?: number;
  shipping_price?: string | number | { value?: number };
}

interface SerpApiResponse {
  shopping_results?: SerpShoppingResult[];
  error?: string;
}

type ParsedPrice = {
  amount: number;
  currency?: string;
};

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_TIMEOUT_MS = numberFromEnv(process.env.SERPAPI_TIMEOUT_MS, 12000);
const RESULT_COUNT = numberFromEnv(process.env.SERPAPI_RESULT_COUNT, 16);
const DEFAULT_LANGUAGE = process.env.SERPAPI_HL ?? "en";
const DEFAULT_LOCATION = process.env.SERPAPI_LOCATION;
const DEFAULT_GOOGLE_DOMAIN = process.env.SERPAPI_GOOGLE_DOMAIN;

const CURRENCY_HINTS: Array<{ regex: RegExp; code: string }> = [
  { regex: /AUD|A\$|AU\$/i, code: "AUD" },
  { regex: /USD|US\$/i, code: "USD" },
  { regex: /CAD|C\$|CA\$/i, code: "CAD" },
  { regex: /NZD|NZ\$/i, code: "NZD" },
  { regex: /GBP|\u00a3/i, code: "GBP" },
  { regex: /EUR|\u20ac/i, code: "EUR" },
];

function detectCurrencyFromText(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }
  const hint = CURRENCY_HINTS.find((entry) => entry.regex.test(text));
  return hint?.code;
}

function parsePriceString(value?: string): ParsedPrice {
  if (!value) {
    return { amount: 0 };
  }

  const numericMatch = value.match(/-?[\d.,]+/);
  if (!numericMatch) {
    return { amount: 0 };
  }

  const cleaned = numericMatch[0].replace(/(\d)[,\.](?=\d{3}(\D|$))/g, "$1");
  const normalized = cleaned.replace(",", ".");
  const amount = Number.parseFloat(normalized);

  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency: detectCurrencyFromText(value),
  };
}

function extractNumberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parsePriceString(value);
    return parsed.amount > 0 ? parsed.amount : parsed.amount === 0 ? 0 : null;
  }

  if (typeof value === "object" && value !== null) {
    const maybeValue =
      (value as { value?: unknown }).value ??
      (value as { amount?: unknown }).amount;
    if (maybeValue !== undefined) {
      return extractNumberFromUnknown(maybeValue);
    }
  }

  return null;
}

function resolveShippingPrice(item: SerpShoppingResult): number | null {
  const candidates = [
    item.extracted_shipping_price,
    item.shipping_price,
    item.shipping,
  ];

  for (const candidate of candidates) {
    const value = extractNumberFromUnknown(candidate);
    if (value !== null && value > 0) {
      return value;
    }
  }

  return null;
}

function resolveProductUrl(item: SerpShoppingResult): string | null {
  const candidate = typeof item.link === "string" && item.link.trim()
    ? item.link
    : typeof item.product_link === "string"
      ? item.product_link
      : null;

  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function resolveThumbnail(item: SerpShoppingResult): string | undefined {
  if (typeof item.thumbnail === "string") {
    return item.thumbnail;
  }

  if (typeof item.image === "string") {
    return item.image;
  }

  if (
    typeof item.image === "object" &&
    item.image !== null &&
    typeof (item.image as { link?: string }).link === "string"
  ) {
    return (item.image as { link?: string }).link;
  }

  return undefined;
}

function buildAffiliateUrl(productUrl: string): string {
  const redirectBase = process.env.SHOP_REDIRECT_BASE_URL;
  if (!redirectBase) {
    return productUrl;
  }

  try {
    const redirectUrl = new URL(redirectBase);
    redirectUrl.searchParams.set("url", productUrl);
    return redirectUrl.toString();
  } catch (err) {
    console.error("Error building affiliate URL:", err);
    return productUrl;
  }
}

function normalizeShoppingItem(
  item: SerpShoppingResult,
  ctx: ProviderContext
): Offer | null {
  const price =
    typeof item.extracted_price === "number" && Number.isFinite(item.extracted_price)
      ? item.extracted_price
      : parsePriceString(item.price).amount;

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const parsedCurrency =
    (typeof item.currency === "string" && item.currency.trim()) ||
    parsePriceString(item.price).currency ||
    ctx.currency;

  const normalizedCurrency = parsedCurrency?.toUpperCase() ?? ctx.currency;
  if (normalizedCurrency !== ctx.currency) {
    return null;
  }

  const productUrl = resolveProductUrl(item);
  if (!productUrl) {
    return null;
  }

  const shippingPrice = resolveShippingPrice(item);
  const totalPrice = price + (shippingPrice ?? 0);

  return {
    source: "google_shopping",
    merchant: item.source?.toString().trim() || "Unknown",
    title: item.title?.toString().trim() || "Untitled",
    price,
    currency: normalizedCurrency,
    productUrl,
    affiliateUrl: buildAffiliateUrl(productUrl),
    thumbnailUrl: resolveThumbnail(item),
    shippingPrice,
    totalPrice,
  };
}

export const googleShoppingProvider: ShopProvider = {
  id: "google_shopping",

  async fetchOffers(query: string, ctx: ProviderContext): Promise<Offer[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      console.warn("SERPAPI_API_KEY not set. Google Shopping provider will return empty results.");
      return [];
    }

    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      api_key: apiKey,
      num: String(RESULT_COUNT),
      gl: (process.env.SERPAPI_GL ?? ctx.country).toLowerCase(),
      hl: DEFAULT_LANGUAGE,
    });

    if (DEFAULT_LOCATION) {
      params.set("location", DEFAULT_LOCATION);
    }

    if (DEFAULT_GOOGLE_DOMAIN) {
      params.set("google_domain", DEFAULT_GOOGLE_DOMAIN);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        console.error(`SerpAPI error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as SerpApiResponse;

      if (data.error) {
        console.error(`SerpAPI responded with error: ${data.error}`);
        return [];
      }

      const shoppingResults = Array.isArray(data.shopping_results)
        ? data.shopping_results
        : [];

      if (shoppingResults.length === 0) {
        return [];
      }

      const offers: Offer[] = [];
      const seenUrls = new Set<string>();

      for (const item of shoppingResults) {
        try {
          const offer = normalizeShoppingItem(item, ctx);
          if (!offer) {
            continue;
          }

          if (seenUrls.has(offer.productUrl)) {
            continue;
          }

          seenUrls.add(offer.productUrl);
          offers.push(offer);
        } catch (itemError) {
          console.warn("Error parsing shopping result item:", itemError);
          continue;
        }
      }

      return offers
        .filter((offer) => offer.totalPrice > 0)
        .sort((a, b) => a.totalPrice - b.totalPrice);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.error(`SerpAPI request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      } else {
        console.error("Error fetching Google Shopping offers:", err);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

