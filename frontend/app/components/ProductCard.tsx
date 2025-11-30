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
    <div className="border border-cyan-500/20 rounded-lg overflow-hidden shadow-[0_0_10px_rgba(0,255,255,0.1)] hover:shadow-[0_0_15px_rgba(0,255,255,0.2)] active:shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-shadow bg-gray-900">
      <div className="aspect-square relative overflow-hidden bg-gray-800">
        {product.thumbnail && (
          <img 
            src={product.thumbnail} 
            alt={product.title}
            className="object-cover w-full h-full"
          />
        )}
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="font-medium text-xs sm:text-sm line-clamp-2 mb-2 min-h-[2.5rem] sm:h-10 text-cyan-200" title={product.title}>
          {product.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-base sm:text-lg text-cyan-300">{product.price}</span>
          <span className="text-[10px] sm:text-xs text-cyan-400/70">{product.source}</span>
        </div>
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 bg-cyan-500 text-black py-2.5 sm:py-2 rounded-md hover:bg-cyan-400 active:bg-cyan-600 transition-colors text-xs sm:text-sm font-medium min-h-[44px] touch-manipulation shadow-[0_0_15px_rgba(0,255,255,0.3)]"
        >
          <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
          Buy Now
        </a>
      </div>
    </div>
  );
};

