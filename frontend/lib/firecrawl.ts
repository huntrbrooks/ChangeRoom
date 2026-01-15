import Firecrawl from '@mendable/firecrawl-js';

/**
 * IMPORTANT (build stability):
 * Don't instantiate Firecrawl at module-import time, because Next.js may evaluate API routes during `next build`
 * (Collecting page data). If FIRECRAWL_API_KEY isn't set at build-time, that would crash the build.
 *
 * Instead, lazily create the client the first time a scrape/search/crawl function is called.
 */
let _firecrawl: Firecrawl | null = null;
function getFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Configure it in Vercel Project Settings → Environment Variables."
    );
  }
  if (!_firecrawl) {
    _firecrawl = new Firecrawl({ apiKey });
  }
  return _firecrawl;
}

export interface ProductData {
  title: string;
  price: string;
  currency: string;
  imageUrl: string;
  description: string;
  brand: string;
  category: string;
  productUrl: string;
}

/**
 * Scrape a product page and extract clothing item details
 * Perfect for "Try On Any URL" feature
 */
export async function scrapeProductPage(url: string): Promise<ProductData | null> {
  try {
    const firecrawl = getFirecrawlClient();
    const result = await firecrawl.scrape(url, {
      formats: [
        'markdown',
        {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Product name/title' },
              price: { type: 'string', description: 'Product price' },
              currency: { type: 'string', description: 'Currency code (USD, AUD, etc)' },
              imageUrl: { type: 'string', description: 'Main product image URL' },
              description: { type: 'string', description: 'Product description' },
              brand: { type: 'string', description: 'Brand name' },
              category: { type: 'string', description: 'Product category (shirt, dress, pants, etc)' },
            },
            required: ['title', 'imageUrl'],
          },
        },
      ],
    });

    if (result?.json) {
      return {
        ...result.json,
        productUrl: url,
      } as ProductData;
    }

    return null;
  } catch (error) {
    console.error('Firecrawl scrape error:', error);
    return null;
  }
}

/**
 * Search the web for fashion items
 * Great for trend discovery and inspiration
 */
export async function searchFashionItems(query: string, limit = 10) {
  try {
    const firecrawl = getFirecrawlClient();
    const result = await firecrawl.search(query, {
      limit,
      scrapeOptions: {
        formats: ['markdown'],
      },
    });

    // Firecrawl v2 client returns a structured object (web/news/images), not { success, data }.
    return result?.web ?? [];
  } catch (error) {
    console.error('Firecrawl search error:', error);
    return [];
  }
}

/**
 * Crawl a fashion retailer to build product catalog
 * Use for bulk importing from partner sites
 */
export async function crawlRetailer(
  retailerUrl: string,
  options: { limit?: number; includePatterns?: string[] } = {}
) {
  const { limit = 50, includePatterns } = options;

  try {
    const firecrawl = getFirecrawlClient();
    const result = await firecrawl.crawl(retailerUrl, {
      limit,
      includePaths: includePatterns,
      scrapeOptions: {
        formats: [
          {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                products: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      price: { type: 'string' },
                      imageUrl: { type: 'string' },
                      productUrl: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });

    return result;
  } catch (error) {
    console.error('Firecrawl crawl error:', error);
    return null;
  }
}

/**
 * Extract all product images from a page
 * Useful for finding multiple views of clothing items
 */
export async function extractProductImages(url: string): Promise<string[]> {
  try {
    const firecrawl = getFirecrawlClient();
    const result = await firecrawl.scrape(url, {
      formats: [
        {
          type: 'json',
          prompt: 'Extract all product/clothing image URLs from this page. Focus on the main product images, not thumbnails or icons.',
        },
      ],
    });

    if (result?.json && typeof result.json === "object") {
      const json = result.json as { imageUrls?: unknown };
      if (Array.isArray(json.imageUrls)) {
        return json.imageUrls.filter((url): url is string => typeof url === "string");
      }
    }

    return [];
  } catch (error) {
    console.error('Firecrawl image extraction error:', error);
    return [];
  }
}

/**
 * Find similar products across the web
 * Great for "Shop Similar" feature
 */
export async function findSimilarProducts(productName: string, brand?: string) {
  const query = brand 
    ? `${productName} ${brand} buy online`
    : `${productName} clothing buy online`;
  
  return searchFashionItems(query, 20);
}

export default getFirecrawlClient;

