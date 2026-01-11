import { NextRequest, NextResponse } from 'next/server';
import { scrapeProductPage, extractProductImages } from '@/lib/firecrawl';
import { auth } from '@clerk/nextjs/server';

/**
 * POST /api/scrape-product
 * 
 * Scrapes a product URL and extracts clothing item details.
 * This powers the "Try On Any URL" feature - a major competitive advantage!
 * 
 * Body: { url: string, extractMultipleImages?: boolean }
 * 
 * Returns: ProductData with title, price, imageUrl, etc.
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url, extractMultipleImages = false } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Scrape the product page
    const productData = await scrapeProductPage(url);

    if (!productData) {
      return NextResponse.json(
        { error: 'Failed to extract product data from URL' },
        { status: 422 }
      );
    }

    // Optionally extract multiple product images
    let additionalImages: string[] = [];
    if (extractMultipleImages) {
      additionalImages = await extractProductImages(url);
    }

    return NextResponse.json({
      success: true,
      product: productData,
      additionalImages,
    });
  } catch (error) {
    console.error('Scrape product error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape product' },
      { status: 500 }
    );
  }
}

