import React, { useState, useEffect } from 'react';
import { Download, Share2, Trash2, Image as ImageIcon } from 'lucide-react';

interface ClothingItem {
  filename: string;
  category: string;
  itemType: string;
  color: string;
  style: string;
  description: string;
  tags: string[];
  fileUrl: string | null;
}

interface Outfit {
  id: string;
  imageUrl: string;
  clothingItems: ClothingItem[];
  createdAt: string;
}

interface MyOutfitsProps {
  onSelectOutfit?: (outfit: Outfit) => void;
}

export const MyOutfits: React.FC<MyOutfitsProps> = ({ onSelectOutfit }) => {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);

  // Load outfits from localStorage on mount and when component is visible
  useEffect(() => {
    loadOutfits();
    
    // Listen for storage events to update when outfits are saved from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'myOutfits') {
        loadOutfits();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom event for same-tab updates
    const handleOutfitSaved = () => {
      loadOutfits();
    };
    
    window.addEventListener('outfitSaved', handleOutfitSaved);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('outfitSaved', handleOutfitSaved);
    };
  }, []);

  const loadOutfits = () => {
    try {
      const stored = localStorage.getItem('myOutfits');
      if (stored) {
        const parsed = JSON.parse(stored) as Outfit[];
        // Sort by creation date (newest first)
        const sorted = parsed.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOutfits(sorted);
      }
    } catch (error) {
      console.error('Error loading outfits:', error);
      setOutfits([]);
    }
  };

  const handleDelete = (outfitId: string) => {
    if (window.confirm('Are you sure you want to delete this outfit?')) {
      try {
        const updated = outfits.filter(o => o.id !== outfitId);
        localStorage.setItem('myOutfits', JSON.stringify(updated));
        setOutfits(updated);
        if (selectedOutfit?.id === outfitId) {
          setSelectedOutfit(null);
        }
      } catch (error) {
        console.error('Error deleting outfit:', error);
      }
    }
  };

  const handleDownload = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `outfit-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    }
  };

  const handleShare = async (outfit: Outfit) => {
    if (navigator.share && outfit.imageUrl) {
      try {
        const response = await fetch(outfit.imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'outfit.jpg', { type: 'image/jpeg' });
        await navigator.share({
          title: 'My Virtual Try-On Outfit',
          text: `Check out my outfit with ${outfit.clothingItems.length} item${outfit.clothingItems.length !== 1 ? 's' : ''}!`,
          files: [file]
        });
      } catch (error: unknown) {
        const err = error as { name?: string };
        if (err.name !== 'AbortError') {
          // Fallback to copying link
          try {
            await navigator.clipboard.writeText(outfit.imageUrl);
            alert('Link copied to clipboard!');
          } catch (clipboardError) {
            console.error('Failed to copy to clipboard:', clipboardError);
          }
        }
      }
    } else if (navigator.clipboard && outfit.imageUrl) {
      try {
        await navigator.clipboard.writeText(outfit.imageUrl);
        alert('Link copied to clipboard!');
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  if (outfits.length === 0) {
    return (
      <div className="w-full py-12 sm:py-16 flex flex-col items-center justify-center text-center px-4">
        <ImageIcon className="w-16 h-16 sm:w-20 sm:h-20 text-[#8B5CF6]/30 mb-4" />
        <h3 className="text-lg sm:text-xl font-bold text-[#8B5CF6] mb-2">
          No Outfits Yet
        </h3>
        <p className="text-sm sm:text-base text-gray-600 max-w-md">
          Your saved try-on outfits will appear here. Generate a try-on to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 sm:space-y-4 md:space-y-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6 px-1">
        <h2 className="text-base sm:text-lg md:text-xl font-bold text-[#8B5CF6]">
          My Outfits ({outfits.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {outfits.map((outfit) => (
          <div
            key={outfit.id}
            className="border-2 border-[#8B5CF6]/30 rounded-lg overflow-hidden bg-[#FAF9F6] shadow-[0_0_15px_rgba(139,92,246,0.2)] hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-shadow"
          >
            {/* Outfit Image */}
            <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
              <img
                src={outfit.imageUrl}
                alt="Saved outfit"
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder-outfit.png';
                }}
              />
              <div className="absolute top-2 right-2 flex gap-1.5 sm:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(outfit.imageUrl);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="bg-[#7C3AED] active:bg-[#8B5CF6] hover:bg-[#8B5CF6] text-white p-2.5 sm:p-2 rounded-lg shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                  aria-label="Download outfit"
                >
                  <Download size={20} className="sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare(outfit);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="bg-[#7C3AED] active:bg-[#8B5CF6] hover:bg-[#8B5CF6] text-white p-2.5 sm:p-2 rounded-lg shadow-[0_0_10px_rgba(139,92,246,0.4)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                  aria-label="Share outfit"
                >
                  <Share2 size={20} className="sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(outfit.id);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="bg-red-500/90 active:bg-red-500 hover:bg-red-500 text-white p-2.5 sm:p-2 rounded-lg shadow-[0_0_10px_rgba(255,0,0,0.4)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                  aria-label="Delete outfit"
                >
                  <Trash2 size={20} className="sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>

            {/* Outfit Details */}
            <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="text-xs sm:text-sm text-gray-500">
                {new Date(outfit.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>

              {/* Clothing Items */}
              <div className="space-y-2">
                <h3 className="text-xs sm:text-sm font-semibold text-[#8B5CF6]">
                  Items ({outfit.clothingItems.length}):
                </h3>
                <div className="space-y-1.5 max-h-28 sm:max-h-32 lg:max-h-40 overflow-y-auto overscroll-contain">
                  {outfit.clothingItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-[#8B5CF6]/5 border border-[#8B5CF6]/20 rounded p-2"
                    >
                      <div className="font-medium text-[#8B5CF6] truncate">
                        {item.itemType || item.category || item.filename}
                      </div>
                      {(item.color || item.style) && (
                        <div className="text-[#8B5CF6]/70 text-[10px] sm:text-xs mt-0.5">
                          {item.color && <span>{item.color}</span>}
                          {item.color && item.style && <span>, </span>}
                          {item.style && <span>{item.style}</span>}
                        </div>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.tags.slice(0, 3).map((tag, tagIdx) => (
                            <span
                              key={tagIdx}
                              className="px-1.5 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[9px] sm:text-[10px] text-[#8B5CF6]"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="text-[9px] sm:text-[10px] text-[#8B5CF6]/70">
                              +{item.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Select Button */}
              {onSelectOutfit && (
                <button
                  onClick={() => {
                    setSelectedOutfit(outfit);
                    onSelectOutfit(outfit);
                  }}
                  onTouchStart={(e) => {
                    // Prevent double-tap zoom
                    if (e.touches.length > 1) {
                      e.preventDefault();
                    }
                  }}
                  className="w-full mt-2 py-2.5 sm:py-2 bg-[#8B5CF6] text-white rounded-lg font-medium active:bg-[#7C3AED] hover:bg-[#7C3AED] transition-colors text-xs sm:text-sm shadow-[0_0_10px_rgba(139,92,246,0.3)] min-h-[44px] touch-manipulation select-none"
                >
                  Use This Outfit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

