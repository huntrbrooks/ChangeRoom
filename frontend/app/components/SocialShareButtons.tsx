'use client';

import React, { useState, useCallback } from 'react';
import { Share2, Download, Instagram, Twitter, Copy, Check, Loader2 } from 'lucide-react';

interface SocialShareButtonsProps {
  imageUrl: string;
  isPreview?: boolean;
  onUpgradeClick?: () => void;
  className?: string;
}

export const SocialShareButtons: React.FC<SocialShareButtonsProps> = ({
  imageUrl,
  isPreview = false,
  onUpgradeClick,
  className = '',
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Share text for social platforms
  const shareText = "Just tried on this outfit with IGetDressed! 👗✨ See how you'd look before you buy → igetdressed.online";
  const shareUrl = 'https://igetdressed.online';
  const hashtags = 'IGetDressed,VirtualTryOn,FashionTech,OOTD';

  // Download image (with watermark for free users)
  const handleDownload = useCallback(async () => {
    if (isPreview && onUpgradeClick) {
      onUpgradeClick();
      return;
    }

    setIsDownloading(true);

    try {
      // For data URLs, download directly
      if (imageUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `igetdressed-outfit-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For remote URLs, fetch and download
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `igetdressed-outfit-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  }, [imageUrl, isPreview, onUpgradeClick]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  }, []);

  // Share to Instagram Stories (opens Instagram with intent)
  const handleInstagramShare = useCallback(() => {
    // Instagram doesn't have direct share URL, so we'll download the image
    // and prompt user to share to their story
    handleDownload();
    
    // Show instructions
    setTimeout(() => {
      alert(
        'Image downloaded! 📸\n\n' +
        'To share to Instagram Stories:\n' +
        '1. Open Instagram app\n' +
        '2. Tap + to create a Story\n' +
        '3. Select the downloaded image\n' +
        '4. Add @igetdressed.online tag!\n\n' +
        'Tag us for a chance to be featured! 🌟'
      );
    }, 500);
  }, [handleDownload]);

  // Share to Twitter/X
  const handleTwitterShare = useCallback(() => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=${hashtags}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  }, []);

  // Native share (mobile)
  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) {
      setShowShareMenu(true);
      return;
    }

    try {
      // Try to share with image if supported
      if (navigator.canShare && imageUrl && !imageUrl.startsWith('data:')) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'igetdressed-outfit.jpg', { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'My IGetDressed Look',
            text: shareText,
            url: shareUrl,
            files: [file],
          });
          return;
        }
      }

      // Fallback to text-only share
      await navigator.share({
        title: 'My IGetDressed Look',
        text: shareText,
        url: shareUrl,
      });
    } catch (error) {
      // User cancelled or share failed - show menu instead
      if ((error as Error).name !== 'AbortError') {
        setShowShareMenu(true);
      }
    }
  }, [imageUrl]);

  return (
    <div className={`relative ${className}`}>
      {/* Main Share Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
            transition-all min-h-[40px] touch-manipulation
            ${isPreview
              ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600'
              : 'bg-black text-white hover:bg-gray-900'
            }
          `}
        >
          {isDownloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          <span>{isPreview ? 'Upgrade to Download' : 'Download'}</span>
        </button>

        {/* Share Button (triggers native share or menu) */}
        <button
          onClick={handleNativeShare}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-black/10 text-black hover:bg-black/20 transition-all min-h-[40px] touch-manipulation"
        >
          <Share2 size={14} />
          <span>Share</span>
        </button>

        {/* Quick Social Buttons (visible on larger screens) */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={handleInstagramShare}
            className="p-2 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 text-white hover:opacity-90 transition-opacity min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Share to Instagram Stories"
          >
            <Instagram size={16} />
          </button>
          <button
            onClick={handleTwitterShare}
            className="p-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Share to X/Twitter"
          >
            <Twitter size={16} />
          </button>
          <button
            onClick={handleCopyLink}
            className="p-2 rounded-lg bg-black/10 text-black hover:bg-black/20 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Copy link"
          >
            {isCopied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Share Menu Dropdown (for desktop or when native share unavailable) */}
      {showShareMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowShareMenu(false)}
          />
          
          {/* Menu */}
          <div className="absolute left-0 top-full mt-2 z-50 w-64 bg-white rounded-xl shadow-xl border border-black/10 overflow-hidden">
            <div className="p-3 border-b border-black/10">
              <h4 className="font-semibold text-sm text-black">Share your look</h4>
              <p className="text-xs text-black/60 mt-0.5">Tag us for a chance to be featured!</p>
            </div>
            
            <div className="p-2">
              <button
                onClick={() => { handleInstagramShare(); setShowShareMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors"
              >
                <div className="p-1.5 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400">
                  <Instagram size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-black">Instagram Stories</p>
                  <p className="text-xs text-black/60">Download & share to story</p>
                </div>
              </button>
              
              <button
                onClick={() => { handleTwitterShare(); setShowShareMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors"
              >
                <div className="p-1.5 rounded-lg bg-black">
                  <Twitter size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-black">X / Twitter</p>
                  <p className="text-xs text-black/60">Tweet your look</p>
                </div>
              </button>
              
              <button
                onClick={() => { handleCopyLink(); setShowShareMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors"
              >
                <div className="p-1.5 rounded-lg bg-black/10">
                  {isCopied ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-black" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-black">{isCopied ? 'Copied!' : 'Copy link'}</p>
                  <p className="text-xs text-black/60">Share anywhere</p>
                </div>
              </button>
            </div>
            
            {/* Referral CTA */}
            <div className="p-3 bg-gradient-to-r from-violet-50 to-purple-50 border-t border-black/10">
              <p className="text-xs text-center text-black/70">
                🎁 <span className="font-medium">Share & earn!</span> Get 2 free credits when your friend signs up
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SocialShareButtons;
