'use client';

import React, { useMemo, useCallback } from 'react';
import { ShoppingCart } from 'lucide-react';
import { convertToAffiliateLink, trackAffiliateClick } from '@/lib/affiliateLinks';

interface Product {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
}

interface ProductCardProps {
  product?: Product;
  loading?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, loading = false }) => {
  const productLink = product?.link ?? '';
  // Convert product link to affiliate link for revenue
  const affiliateLink = useMemo(() => {
    if (!productLink) return '';
    return convertToAffiliateLink(productLink);
  }, [productLink]);

  // Track affiliate click for analytics
  const handleClick = useCallback(() => {
    if (!product) return;
    trackAffiliateClick(
      product.link,
      affiliateLink,
      product.title,
      product.source
    );
  }, [product, affiliateLink]);

  if (loading || !product) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white animate-pulse">
        <div className="aspect-square bg-slate-200" />
        <div className="p-3 sm:p-4 space-y-3">
          <div className="h-4 w-3/4 bg-slate-200" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 bg-slate-200" />
            <div className="h-3 w-12 bg-slate-200" />
          </div>
          <div className="h-10 w-full rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="aspect-square relative overflow-hidden bg-slate-100">
        {product.thumbnail && (
          // Use <img> instead of next/image because shopping thumbnails can come from many hosts.
          // This avoids brittle remote-host allowlists and prevents silent "no image" failures.
          <img
            src={product.thumbnail}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="mb-2 min-h-[2.5rem] text-xs font-semibold leading-5 text-[#101114] line-clamp-2 sm:h-10 sm:text-sm" title={product.title}>
          {product.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="text-base font-semibold text-[#101114] sm:text-lg">{product.price}</span>
          <span className="text-[10px] text-slate-500 sm:text-xs">{product.source}</span>
        </div>
        <a
          href={affiliateLink}
          onClick={handleClick}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#101114] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#20232a] active:bg-[#20232a] sm:py-2 sm:text-sm touch-manipulation"
        >
          <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
          Buy Now
        </a>
      </div>
    </div>
  );
};
