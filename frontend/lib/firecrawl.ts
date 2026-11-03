// Only the two product-page operations below are used. Keep parsing on the server.
async function scrape(url: string, options: { formats: unknown[] }): Promise<{ json?: Record<string, unknown> }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('Product lookup is not configured');
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...options }),
  });
  if (!response.ok) throw new Error(`Product lookup failed (${response.status})`);
  const result = await response.json();
  if (!result.success || !result.data) throw new Error('Product lookup returned no data');
  return result.data;
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
    const result = await scrape(url, {
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
 * Extract all product images from a page
 * Useful for finding multiple views of clothing items
 */
export async function extractProductImages(url: string): Promise<string[]> {
  try {
    const result = await scrape(url, {
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

