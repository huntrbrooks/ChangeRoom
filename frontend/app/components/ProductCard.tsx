import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface Product {
  title: string;
  price: string;
  link: string;
  thumbnail: string;
  source: string;
}

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  return (
    <div className="border border-[#FF13F0]/20 rounded-lg overflow-hidden shadow-[0_0_10px_rgba(255,19,240,0.1)] hover:shadow-[0_0_15px_rgba(255,19,240,0.2)] active:shadow-[0_0_20px_rgba(255,19,240,0.3)] transition-shadow bg-[#FAF9F6]">
      <div className="aspect-square relative overflow-hidden bg-gray-100">
        {product.thumbnail && (
          <img 
            src={product.thumbnail} 
            alt={product.title}
            className="object-cover w-full h-full"
          />
        )}
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="font-medium text-xs sm:text-sm line-clamp-2 mb-2 min-h-[2.5rem] sm:h-10 text-[#FF13F0]" title={product.title}>
          {product.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-base sm:text-lg text-[#FF13F0]">{product.price}</span>
          <span className="text-[10px] sm:text-xs text-[#FF13F0]/70">{product.source}</span>
        </div>
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 bg-[#FF13F0] text-white py-2.5 sm:py-2 rounded-md hover:bg-[#FF13F0]/90 active:bg-[#FF13F0]/80 transition-colors text-xs sm:text-sm font-medium min-h-[44px] touch-manipulation shadow-[0_0_15px_rgba(255,19,240,0.3)]"
        >
          <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
          Buy Now
        </a>
      </div>
    </div>
  );
};

