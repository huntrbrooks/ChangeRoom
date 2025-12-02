/**
 * Product features configuration
 * Links features to products for display in pricing tables and UI
 */

export type PlanType = 'free' | 'standard' | 'pro';

export interface Feature {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface ProductFeatures {
  plan: PlanType;
  name: string;
  description: string;
  price: {
    amount: number;
    currency: string;
    period: 'month' | 'one-time';
    priceId?: string; // Stripe price ID
  };
  credits: number;
  features: Feature[];
  popular?: boolean;
  badge?: string;
}

export const productFeatures: Record<PlanType, ProductFeatures> = {
  free: {
    plan: 'free',
    name: 'Free',
    description: 'Perfect for trying out Change Room',
    price: {
      amount: 0,
      currency: 'USD',
      period: 'month',
    },
    credits: 0, // 1 free try-on, no credits
    features: [
      {
        id: 'free-try-on',
        name: '1 Free Try-On',
        description: 'Experience the magic of virtual try-on',
      },
      {
        id: 'basic-features',
        name: 'Basic Features',
        description: 'Access to core try-on functionality',
      },
      {
        id: 'product-search',
        name: 'Product Search',
        description: 'Find similar items after try-on',
      },
    ],
  },
  standard: {
    plan: 'standard',
    name: 'Standard',
    description: 'Perfect for regular users',
    price: {
      amount: 9.99,
      currency: 'USD',
      period: 'month',
    },
    credits: 50,
    features: [
      {
        id: 'monthly-credits',
        name: '50 Credits/Month',
        description: 'Enough for 50 try-ons every month',
      },
      {
        id: 'unlimited-wardrobe',
        name: 'Unlimited Wardrobe',
        description: 'Upload as many clothing items as you want',
      },
      {
        id: 'multi-item-tryon',
        name: 'Multi-Item Try-On',
        description: 'Try on up to 5 items at once',
      },
      {
        id: 'product-search',
        name: 'Product Search',
        description: 'Find and shop similar items',
      },
      {
        id: 'high-quality',
        name: 'High Quality Results',
        description: 'Photorealistic try-on images',
      },
      {
        id: 'monthly-refresh',
        name: 'Monthly Credit Refresh',
        description: 'Credits automatically refresh each month',
      },
    ],
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    description: 'Best value for power users and professionals',
    price: {
      amount: 19.99,
      currency: 'USD',
      period: 'month',
    },
    credits: 250,
    popular: true,
    badge: 'POPULAR',
    features: [
      {
        id: 'monthly-credits',
        name: '250 Credits/Month',
        description: 'Enough for 250 try-ons every month',
      },
      {
        id: 'unlimited-wardrobe',
        name: 'Unlimited Wardrobe',
        description: 'Upload as many clothing items as you want',
      },
      {
        id: 'multi-item-tryon',
        name: 'Multi-Item Try-On',
        description: 'Try on up to 5 items at once',
      },
      {
        id: 'product-search',
        name: 'Product Search',
        description: 'Find and shop similar items',
      },
      {
        id: 'high-quality',
        name: 'High Quality Results',
        description: 'Photorealistic try-on images',
      },
      {
        id: 'monthly-refresh',
        name: 'Monthly Credit Refresh',
        description: 'Credits automatically refresh each month',
      },
      {
        id: 'priority-support',
        name: 'Priority Support',
        description: 'Get help faster when you need it',
      },
      {
        id: 'best-value',
        name: 'Best Value',
        description: 'Lowest cost per try-on ($0.08)',
      },
    ],
  },
};

/**
 * Get features for a specific plan
 */
export function getProductFeatures(plan: PlanType): ProductFeatures {
  return productFeatures[plan];
}

/**
 * Get all products for pricing table display
 */
export function getAllProducts(): ProductFeatures[] {
  return Object.values(productFeatures);
}

/**
 * Compare features between plans
 */
export function compareFeatures(plan1: PlanType, plan2: PlanType): {
  uniqueToPlan1: Feature[];
  uniqueToPlan2: Feature[];
  common: Feature[];
} {
  const features1 = productFeatures[plan1].features;
  const features2 = productFeatures[plan2].features;
  
  const ids1 = new Set(features1.map(f => f.id));
  const ids2 = new Set(features2.map(f => f.id));
  
  return {
    uniqueToPlan1: features1.filter(f => !ids2.has(f.id)),
    uniqueToPlan2: features2.filter(f => !ids1.has(f.id)),
    common: features1.filter(f => ids2.has(f.id)),
  };
}



