'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { CheckCircle2, ImageIcon } from 'lucide-react';
import type { ShopSaveClothingItem } from './ShopSaveModal';
import { ensureAbsoluteUrl } from '@/lib/url';

interface ShopSaveSelectorProps {
  items: ShopSaveClothingItem[];
  selectedIds: string[];
  maxSelection: number;
  onToggle: (item: ShopSaveClothingItem) => void;
  savedIds: string[];
  onSaveToggle?: (item: ShopSaveClothingItem, shouldSave: boolean) => void;
  onTryAgain?: (item: ShopSaveClothingItem) => void;
}

interface GroupedItems {
  key: string;
  label: string;
  timestamp: number;
  items: ShopSaveClothingItem[];
}

const formatDateLabel = (value?: string | Date | null) => {
  if (!value) {
    return 'Recently saved';
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return 'Recently saved';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getTimestamp = (value?: string | Date | null) => {
  if (!value) return 0;
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export const ShopSaveSelector: React.FC<ShopSaveSelectorProps> = ({
  items,
  selectedIds,
  maxSelection,
  onToggle,
  savedIds,
  onSaveToggle,
  onTryAgain,
}) => {
  const grouped = useMemo(() => {
    const groups = new Map<string, GroupedItems>();
    items.forEach((item) => {
      const label = formatDateLabel(item.created_at ?? null);
      const timestamp = getTimestamp(item.created_at ?? null);
      if (!groups.has(label)) {
        groups.set(label, {
          key: label,
          label,
          timestamp,
          items: [],
        });
      }
      groups.get(label)!.items.push(item);
    });
    return Array.from(groups.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-black/60">
            <span>{group.label}</span>
            <span>Items ({group.items.length})</span>
          </div>
          <div className="space-y-2">
            {group.items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const selectionLimitReached =
                !isSelected && selectedIds.length >= maxSelection;
              const isSaved = savedIds.includes(item.id);
              const baseTitle =
                item.subcategory ||
                item.description ||
                item.original_filename ||
                'Saved item';
              const itemTitle = item.brand ? `${item.brand} · ${baseTitle}` : baseTitle;
              const subtitle = [item.color, item.style].filter(Boolean).join(', ');

              const imageUrl = ensureAbsoluteUrl(item.public_url);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item)}
                  disabled={selectionLimitReached}
                  aria-pressed={isSelected}
                  aria-label={`Select wardrobe item ${itemTitle}`}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-all flex gap-3 items-stretch bg-[#f7f7f5] ${
                    isSelected
                      ? 'border-black shadow-[0_4px_20px_rgba(0,0,0,0.12)]'
                      : 'border-black/15 hover:border-black/50'
                  } ${selectionLimitReached ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={item.description || item.subcategory || 'Wardrobe item'}
                        fill
                        sizes="80px"
                        className="object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-black/40">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    {isSelected && (
                      <span className="absolute right-2 top-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        Picked
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-black/50">
                        {item.category?.replace('_', ' ') || 'Item'}
                      </p>
                      <p className="text-sm font-bold text-black">{itemTitle}</p>
                      {subtitle && (
                        <p className="text-xs text-black/60">{subtitle}</p>
                      )}
                    </div>
                    <div>
                      {item.description && (
                        <p className="text-xs text-black/70 line-clamp-2 mb-1">
                          {item.description}
                        </p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {item.tags.slice(0, 4).map((tag) => (
                            <span
                              key={`${item.id}-${tag}`}
                              className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-black/70"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {(onSaveToggle || onTryAgain) && (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {onSaveToggle && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSaveToggle(item, !isSaved);
                              }}
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                                isSaved
                                  ? 'bg-black text-white border border-black'
                                  : 'bg-white text-black border border-black/30 hover:border-black'
                              }`}
                            >
                              {isSaved ? 'Saved' : 'Save'}
                            </button>
                          )}
                          {onTryAgain && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onTryAgain(item);
                              }}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide border border-black/20 bg-black text-white hover:bg-black/90 transition-colors"
                            >
                              Try on again
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};


