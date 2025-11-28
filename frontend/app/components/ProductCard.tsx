import React from 'react';
import { ExternalLink, ShoppingCart } from 'lucide-react';

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
    <div className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
      <div className="aspect-square relative overflow-hidden bg-gray-100">
        {product.thumbnail && (
          <img 
            src={product.thumbnail} 
            alt={product.title}
            className="object-cover w-full h-full"
          />
        )}
      </div>
      <div className="p-4">
        <h3 className="font-medium text-sm line-clamp-2 mb-2 h-10" title={product.title}>
          {product.title}
        </h3>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-lg">{product.price}</span>
          <span className="text-xs text-gray-500">{product.source}</span>
        </div>
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 bg-black text-white py-2 rounded-md hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <ShoppingCart size={16} />
          Buy Now
        </a>
      </div>
    </div>
  );
};

