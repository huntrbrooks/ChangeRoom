'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  DollarSign,
  Loader2,
  ShoppingBag,
  X,
} from 'lucide-react';
import { ShopSaveSelector } from './ShopSaveSelector';

export interface ShopSaveClothingItem {
  id: string;
  public_url: string;
  category: string;
  subcategory?: string | null;
  color?: string | null;
  style?: string | null;
  description?: string | null;
  tags?: string[] | null;
  original_filename?: string | null;
  created_at?: string | Date | null;
}

export interface ShopSaveOffer {
  id: string;
  source: string;
  merchant: string;
  title: string;
  price: number;
  currency: string;
  productUrl: string;
  affiliateUrl?: string | null;
  thumbnailUrl?: string | null;
  shippingPrice?: number | null;
  totalPrice: number;
}

export interface ShopSaveResult {
  item: ShopSaveClothingItem;
  offers: ShopSaveOffer[];
}

interface ShopSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResults: (results: ShopSaveResult[]) => void;
}

const MAX_SELECTION = 5;

function formatMoney(value: number | null | undefined, currency?: string | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency || 'AUD',
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}

export const ShopSaveModal: React.FC<ShopSaveModalProps> = ({
  isOpen,
  onClose,
  onResults,
}) => {
  const [items, setItems] = useState<ShopSaveClothingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [localResults, setLocalResults] = useState<ShopSaveResult[]>([]);
  const hasRequestedItemsRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    setItemsError(null);
    try {
      const response = await axios.get('/api/my/clothing-items', {
        params: { limit: 50 },
      });
      setItems(response.data?.clothingItems || []);
    } catch (error: unknown) {
      console.error('Failed to load wardrobe items', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setItemsError('Sign in to view your saved wardrobe items.');
        } else {
          setItemsError(
            error.response?.data?.error ||
              'Could not load your wardrobe. Please try again.'
          );
        }
      } else {
        setItemsError('Could not load your wardrobe. Please try again.');
      }
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      hasRequestedItemsRef.current = false;
      return;
    }
    if (hasRequestedItemsRef.current || loadingItems) {
      return;
    }
    hasRequestedItemsRef.current = true;
    void fetchItems();
  }, [fetchItems, isOpen, loadingItems]);

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        if (prev.includes(id)) {
          return prev.filter((existing) => existing !== id);
        }
        if (prev.length >= MAX_SELECTION) {
          return prev;
        }
        return [...prev, id];
      });
    },
    [setSelectedIds]
  );

  const notifySelection = useCallback(async (item: ShopSaveClothingItem) => {
    try {
      await axios.post('/api/shop/selection', {
        clothingItemId: item.id,
        metadata: {
          category: item.category,
          subcategory: item.subcategory,
          color: item.color,
          style: item.style,
          tags: item.tags || [],
        },
      });
    } catch (error) {
      console.warn('Shop selection notification failed', error);
    }
  }, []);

  const handleItemToggle = useCallback(
    (item: ShopSaveClothingItem) => {
      const alreadySelected = selectedIds.includes(item.id);
      if (alreadySelected) {
        toggleSelect(item.id);
        return;
      }
      if (selectedIds.length >= MAX_SELECTION) {
        return;
      }
      toggleSelect(item.id);
      void notifySelection(item);
    },
    [notifySelection, selectedIds, toggleSelect]
  );

  const handleSearch = useCallback(async () => {
    if (selectedIds.length === 0) {
      setSearchError('Select at least one clothing item to continue.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await axios.post('/api/shop-search', {
        clothingItemIds: selectedIds,
      });
      const offersMap = response.data?.offers || {};
      const results: ShopSaveResult[] = selectedIds.map((id) => {
        const item = items.find((it) => it.id === id);
        const fallback: ShopSaveClothingItem = item || {
          id,
          public_url: '',
          category: 'unknown',
          subcategory: '',
          color: '',
          style: '',
          description: '',
          tags: [],
          original_filename: '',
        };
        return {
          item: fallback,
          offers: offersMap[id] || [],
        };
      });
      setLocalResults(results);
      onResults(results);
    } catch (error: unknown) {
      console.error('Shop & Save search failed', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setSearchError('Please sign in to search for offers.');
        } else {
          setSearchError(
            error.response?.data?.error ||
              'Could not fetch offers. Please try again.'
          );
        }
      } else {
        setSearchError('Could not fetch offers. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, [items, onResults, selectedIds]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-black shadow-[0_0_30px_rgba(0,0,0,0.4)]">
        <div className="flex items-start justify-between border-b border-black/10 px-6 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-black/70">
              Shop &amp; Save
            </p>
            <h2 className="text-xl font-bold">Pick up to 5 items to price match</h2>
            <p className="text-xs text-black/60">
              Selected {selectedIds.length}/{MAX_SELECTION} items
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-black/5 p-2 text-black hover:bg-black/10 transition-colors"
            aria-label="Close Shop & Save"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {itemsError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p>{itemsError}</p>
                <button
                  onClick={() => {
                    if (itemsError?.includes('Sign in')) {
                      window.location.href = '/sign-in';
                    } else {
                      void fetchItems();
                    }
                  }}
                  className="mt-1 text-xs font-semibold underline"
                >
                  {itemsError?.includes('Sign in') ? 'Go to sign in' : 'Try again'}
                </button>
              </div>
            </div>
          )}

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-black" />
              <p className="mt-3 text-sm text-black/70">Loading your wardrobe...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-black/5 p-6 text-center">
              <ShoppingBag className="mx-auto h-10 w-10 text-black/50" />
              <h3 className="mt-3 text-base font-semibold">No saved wardrobe items yet</h3>
              <p className="mt-2 text-sm text-black/60">
                Upload clothing items in the <strong>Choose Wardrobe</strong> step first, then come back to shop for deals.
              </p>
              <a
                href="#choose-wardrobe"
                onClick={onClose}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-black px-4 py-2 text-sm font-semibold uppercase tracking-wide"
              >
                Go to wardrobe
              </a>
            </div>
          ) : (
            <>
              <ShopSaveSelector
                items={items}
                selectedIds={selectedIds}
                maxSelection={MAX_SELECTION}
                onToggle={handleItemToggle}
              />

              {selectedIds.length >= MAX_SELECTION && (
                <p className="text-xs font-semibold uppercase tracking-wide text-black/60">
                  Maximum of {MAX_SELECTION} items selected
                </p>
              )}
            </>
          )}

          {localResults.length > 0 && (
            <div className="mt-6 space-y-3 rounded-xl border border-black/10 bg-black/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-black/70">
                <DollarSign size={16} />
                Cheapest offers
              </div>
              {localResults.map((result) => (
                <div
                  key={result.item.id}
                  className="rounded-lg border border-black/10 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-black/60">
                        {result.item.category?.replace('_', ' ') || 'Item'}
                      </p>
                      <p className="text-sm font-bold">
                        {result.item.subcategory || result.item.description || result.item.original_filename}
                      </p>
                    </div>
                    <span className="text-xs text-black/50">
                      {result.offers.length > 0
                        ? `${result.offers.length} offer${result.offers.length !== 1 ? 's' : ''} found`
                        : 'No offers yet'}
                    </span>
                  </div>
                  {result.offers.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {result.offers.slice(0, 3).map((offer) => (
                        <a
                          key={`${result.item.id}-${offer.source}-${offer.merchant}-${offer.title}`}
                          href={offer.affiliateUrl || offer.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm hover:border-black/40 transition-colors"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {offer.merchant || offer.source}
                            </span>
                            <span className="text-xs text-black/60">{offer.title}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">
                              {formatMoney(offer.totalPrice || offer.price, offer.currency)}
                            </p>
                            {offer.shippingPrice && offer.shippingPrice > 0 && (
                              <p className="text-[11px] text-black/60">
                                + {formatMoney(offer.shippingPrice, offer.currency)} ship
                              </p>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-black/60">
                      We could not find matching offers right now.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-black/10 bg-white px-6 py-4">
          {searchError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <p>{searchError}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-black/60">
              We&apos;ll use Google Shopping and partner feeds to find the lowest prices for your picks.
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || selectedIds.length === 0}
              className={`flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-wide transition-colors min-h-[44px] ${
                isSearching || selectedIds.length === 0
                  ? 'bg-black/20 text-black/50 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-black/80'
              }`}
            >
              {isSearching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <ShoppingBag size={16} />
                  Find best prices
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


