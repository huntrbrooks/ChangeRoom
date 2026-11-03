// Prices displayed at checkout and credits granted by the webhook share these values.
export const offers = [
  { sku: "creator", key: "creatorPriceId", name: "Creator", plan: "standard", cents: 2499, credits: 25, mode: "subscription" },
  { sku: "power", key: "powerPriceId", name: "Power", plan: "pro", cents: 4999, credits: 70, mode: "subscription" },
  { sku: "starter-pack", key: "starterPriceId", name: "Starter pack", plan: "free", cents: 1499, credits: 10, mode: "payment" },
  { sku: "value-pack", key: "valuePriceId", name: "Value pack", plan: "free", cents: 3499, credits: 30, mode: "payment" },
  { sku: "pro-pack", key: "proPriceId", name: "Pro pack", plan: "free", cents: 8999, credits: 100, mode: "payment" },
] as const;
export type Offer = (typeof offers)[number];
type Prices = Partial<Record<Offer["key"] | "starterXmasPriceId", string>>;
export function offerForPrice(prices: Prices, id: string | null | undefined) {
  return id ? offers.find(offer => prices[offer.key] === id) : undefined;
}
export function packCredits(prices: Prices, id: string | null | undefined) {
  if (!id) return 0;
  if (id === prices.starterXmasPriceId) return 20; // settle previously sold packs only
  const offer = offerForPrice(prices, id);
  return offer?.mode === "payment" ? offer.credits : 0;
}
export function aud(cents: number) { return `A$${(cents / 100).toFixed(2)}`; }

export type CheckoutSelection = {sku:string} | {priceId:string; mode:'payment'|'subscription'};
export function resolveCheckout(prices:Prices, selection:CheckoutSelection) {
  const offer = 'sku' in selection ? offers.find(o=>o.sku===selection.sku)
    : offerForPrice(prices,selection.priceId);
  if (!offer || ('mode' in selection && selection.mode!==offer.mode)) return null;
  const priceId=prices[offer.key];
  return priceId && priceId.startsWith('price_') ? {offer,priceId,mode:offer.mode} : null;
}
