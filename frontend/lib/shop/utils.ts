/**
 * Shop utility functions
 */

/**
 * Select the best link to use, prioritizing affiliate links
 * 
 * @param normalLink - The standard product URL
 * @param affiliateLink - Optional affiliate URL (null or undefined if not available)
 * @returns The selected link (affiliate if available, otherwise normal)
 */
export function selectLink(normalLink: string, affiliateLink: string | null | undefined): string {
  // If affiliate link is provided and non-empty, use it
  if (affiliateLink && affiliateLink.trim().length > 0) {
    return affiliateLink;
  }
  
  // Otherwise, use the normal link
  return normalLink;
}

