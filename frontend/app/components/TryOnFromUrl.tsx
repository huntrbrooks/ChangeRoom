'use client';

import React, { useState, useCallback } from 'react';
import { Link2, Loader2, X, ExternalLink, AlertCircle } from 'lucide-react';

interface ScrapedProduct {
  title: string;
  price?: string;
  currency?: string;
  imageUrl: string;
  description?: string;
  brand?: string;
  category?: string;
  productUrl: string;
}

interface TryOnFromUrlProps {
  onProductScraped: (product: ScrapedProduct, imageFile: File) => void;
  isAuthenticated?: boolean;
  onAuthRequired?: () => void;
  disabled?: boolean;
}

export const TryOnFromUrl: React.FC<TryOnFromUrlProps> = ({
  onProductScraped,
  isAuthenticated = true,
  onAuthRequired,
  disabled = false,
}) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapedProduct, setScrapedProduct] = useState<ScrapedProduct | null>(null);

  const isValidUrl = useCallback((urlString: string): boolean => {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  const handleScrape = useCallback(async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }

    if (!url.trim()) {
      setError('Please enter a product URL');
      return;
    }

    if (!isValidUrl(url)) {
      setError('Please enter a valid URL (starting with http:// or https://)');
      return;
    }

    setIsLoading(true);
    setError(null);
    setScrapedProduct(null);

    try {
      const response = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          onAuthRequired?.();
          throw new Error('Please sign in to use this feature');
        }
        throw new Error(errorData.error || `Failed to fetch product (${response.status})`);
      }

      const data = await response.json();

      if (!data.success || !data.product) {
        throw new Error('Could not extract product data from this URL. Try a different product page.');
      }

      const product = data.product as ScrapedProduct;
      
      if (!product.imageUrl) {
        throw new Error('No product image found on this page. Try a different URL.');
      }

      setScrapedProduct(product);
    } catch (err) {
      console.error('Scrape error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch product');
    } finally {
      setIsLoading(false);
    }
  }, [url, isAuthenticated, isValidUrl, onAuthRequired]);

  const handleAddToWardrobe = useCallback(async () => {
    if (!scrapedProduct?.imageUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch the image and create a File object
      const imageResponse = await fetch(scrapedProduct.imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to download product image');
      }

      const blob = await imageResponse.blob();
      const filename = `${scrapedProduct.title?.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50) || 'product'}.jpg`;
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

      // Call parent callback with product data and file
      onProductScraped(scrapedProduct, file);

      // Reset state
      setUrl('');
      setScrapedProduct(null);
    } catch (err) {
      console.error('Add to wardrobe error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add product to wardrobe');
    } finally {
      setIsLoading(false);
    }
  }, [scrapedProduct, onProductScraped]);

  const handleClear = useCallback(() => {
    setUrl('');
    setError(null);
    setScrapedProduct(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && url.trim()) {
      handleScrape();
    }
  }, [handleScrape, isLoading, url]);

  return (
    <div className="space-y-3">
      {/* URL Input Section */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Link2 size={16} className="text-black/40" />
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste any product URL (ASOS, Zara, H&M...)"
            disabled={isLoading || disabled || !isAuthenticated}
            className={`
              w-full pl-9 pr-10 py-2.5 rounded-lg border text-sm
              transition-colors focus:outline-none focus:ring-2 focus:ring-black/20
              ${disabled || !isAuthenticated
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white border-black/20 text-black hover:border-black/40 focus:border-black'
              }
            `}
          />
          {url && !isLoading && (
            <button
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-black/40 hover:text-black/70 transition-colors"
              aria-label="Clear URL"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={handleScrape}
          disabled={isLoading || !url.trim() || disabled || !isAuthenticated}
          className={`
            px-4 py-2.5 rounded-lg font-semibold text-sm uppercase tracking-wide
            transition-all min-h-[44px] touch-manipulation
            ${isLoading || !url.trim() || disabled || !isAuthenticated
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-900 active:scale-[0.98]'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="hidden sm:inline">Fetching...</span>
            </span>
          ) : (
            <span>Fetch</span>
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Scraped Product Preview */}
      {scrapedProduct && (
        <div className="border border-black/20 rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="flex gap-3 p-3">
            {/* Product Image */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 border border-black/10">
              <img
                src={scrapedProduct.imageUrl}
                alt={scrapedProduct.title || 'Product'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder-clothing.png';
                }}
              />
            </div>

            {/* Product Details */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-black line-clamp-2">
                {scrapedProduct.title || 'Product'}
              </h4>
              {scrapedProduct.brand && (
                <p className="text-xs text-black/60 mt-0.5">{scrapedProduct.brand}</p>
              )}
              {scrapedProduct.price && (
                <p className="text-sm font-bold text-black mt-1">
                  {scrapedProduct.currency && scrapedProduct.currency !== 'USD' 
                    ? `${scrapedProduct.currency} ` 
                    : '$'}
                  {scrapedProduct.price}
                </p>
              )}
              {scrapedProduct.category && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-black/10 text-[10px] uppercase tracking-wide text-black/70">
                  {scrapedProduct.category}
                </span>
              )}
            </div>

            {/* Source Link */}
            <a
              href={scrapedProduct.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 p-2 text-black/40 hover:text-black transition-colors"
              aria-label="View original product"
            >
              <ExternalLink size={16} />
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex border-t border-black/10">
            <button
              onClick={handleClear}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-black/70 hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddToWardrobe}
              disabled={isLoading}
              className={`
                flex-1 px-4 py-2.5 text-sm font-semibold border-l border-black/10 transition-colors
                ${isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-900'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Adding...
                </span>
              ) : (
                'Add to Wardrobe'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Helper Text */}
      {!scrapedProduct && !error && (
        <p className="text-[11px] text-black/50">
          Paste a product URL from any fashion retailer to try it on instantly. Works with ASOS, Zara, H&M, SHEIN, and more.
        </p>
      )}
    </div>
  );
};

export default TryOnFromUrl;

