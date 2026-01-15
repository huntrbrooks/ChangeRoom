/**
 * Affiliate Link Manager
 * 
 * Converts direct product links to affiliate links for revenue generation.
 * This creates passive income from every product click.
 * 
 * Setup required:
 * 1. Join affiliate programs (ASOS, Amazon, ShopStyle, etc.)
 * 2. Add your affiliate IDs to environment variables
 * 3. Links are automatically converted when products are displayed
 */

interface AffiliateConfig {
  // Amazon Associates
  amazonTag?: string;
  // ASOS
  asosAffiliateId?: string;
  // ShopStyle Collective
  shopStylePid?: string;
  // Commission Junction (for many brands)
  cjPublisherId?: string;
  // Impact (for many fashion brands)
  impactId?: string;
  // Custom affiliate network params
  customParams?: Record<string, string>;
}

// Load affiliate IDs from environment
const affiliateConfig: AffiliateConfig = {
  amazonTag: process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG || '',
  asosAffiliateId: process.env.NEXT_PUBLIC_ASOS_AFFILIATE_ID || '',
  shopStylePid: process.env.NEXT_PUBLIC_SHOPSTYLE_PID || '',
  cjPublisherId: process.env.NEXT_PUBLIC_CJ_PUBLISHER_ID || '',
  impactId: process.env.NEXT_PUBLIC_IMPACT_ID || '',
};

/**
 * Detect which affiliate program to use based on URL
 */
function detectAffiliate(url: string): string | null {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('amazon.com') || urlLower.includes('amzn.to')) {
    return 'amazon';
  }
  if (urlLower.includes('asos.com')) {
    return 'asos';
  }
  if (urlLower.includes('hm.com') || urlLower.includes('h&m')) {
    return 'hm';
  }
  if (urlLower.includes('zara.com')) {
    return 'zara';
  }
  if (urlLower.includes('nordstrom.com')) {
    return 'nordstrom';
  }
  if (urlLower.includes('shopbop.com')) {
    return 'shopbop';
  }
  if (urlLower.includes('net-a-porter.com')) {
    return 'netaporter';
  }
  if (urlLower.includes('farfetch.com')) {
    return 'farfetch';
  }
  if (urlLower.includes('ssense.com')) {
    return 'ssense';
  }
  if (urlLower.includes('shein.com')) {
    return 'shein';
  }
  if (urlLower.includes('boohoo.com')) {
    return 'boohoo';
  }
  if (urlLower.includes('prettylittlething.com')) {
    return 'plt';
  }
  if (urlLower.includes('revolve.com')) {
    return 'revolve';
  }

  return null;
}

/**
 * Convert a direct product URL to an affiliate link
 * Returns the original URL if no affiliate program is configured
 */
export function convertToAffiliateLink(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  try {
    const url = new URL(originalUrl);
    const affiliate = detectAffiliate(originalUrl);

    switch (affiliate) {
      case 'amazon':
        if (affiliateConfig.amazonTag) {
          // Add Amazon Associates tag
          url.searchParams.set('tag', affiliateConfig.amazonTag);
          // Add tracking params
          url.searchParams.set('linkCode', 'ogi');
          url.searchParams.set('th', '1');
        }
        break;

      case 'asos':
        if (affiliateConfig.asosAffiliateId) {
          // ASOS affiliate link format
          url.searchParams.set('affid', affiliateConfig.asosAffiliateId);
          url.searchParams.set('channelref', 'igetdressed');
        }
        break;

      case 'shopbop':
      case 'netaporter':
      case 'farfetch':
        // These often use ShopStyle Collective
        if (affiliateConfig.shopStylePid) {
          // Return ShopStyle redirect URL
          return `https://api.shopstyle.com/action/apiVisitRetailer?id=${affiliateConfig.shopStylePid}&pid=${encodeURIComponent(originalUrl)}`;
        }
        break;

      default:
        // For unknown retailers, try generic tracking params
        // You can extend this with more affiliate networks
        if (affiliateConfig.impactId) {
          url.searchParams.set('irclickid', affiliateConfig.impactId);
        }
    }

    return url.toString();
  } catch (error) {
    console.warn('[affiliateLinks] Failed to convert URL:', error);
    return originalUrl;
  }
}

/**
 * Track affiliate link click for analytics
 */
export function trackAffiliateClick(
  originalUrl: string,
  affiliateUrl: string,
  productTitle: string,
  source: string
): void {
  // Fire and forget analytics
  fetch('/api/events/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'affiliate_click',
      data: {
        originalUrl,
        affiliateUrl,
        productTitle,
        source,
        timestamp: new Date().toISOString(),
      },
    }),
  }).catch(() => {
    // Silent fail - don't block user
  });
}

/**
 * Get affiliate program info for display
 */
export function getAffiliateInfo(url: string): { name: string; hasAffiliate: boolean } {
  const affiliate = detectAffiliate(url);
  
  if (!affiliate) {
    return { name: 'Unknown', hasAffiliate: false };
  }

  const hasConfig = Boolean(
    (affiliate === 'amazon' && affiliateConfig.amazonTag) ||
    (affiliate === 'asos' && affiliateConfig.asosAffiliateId) ||
    affiliateConfig.shopStylePid ||
    affiliateConfig.impactId
  );

  return {
    name: affiliate.charAt(0).toUpperCase() + affiliate.slice(1),
    hasAffiliate: hasConfig,
  };
}

const affiliateLinks = {
  convertToAffiliateLink,
  trackAffiliateClick,
  getAffiliateInfo,
};

export default affiliateLinks;

