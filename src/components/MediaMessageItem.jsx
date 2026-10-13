import React, { useState, useEffect } from 'react';

export default function MediaMessageItem({ msg, isSender, currentUser }) {
  const [isDownloaded, setIsDownloaded] = useState(isSender);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const resolvedMsgId = msg?.id || msg?._id || msg?.mediaUrl;
  const userKey = currentUser?.uid || 'guest';
  const primaryStorageKey = `qwik_downloaded_media_${userKey}`;
  const legacyStorageKey = `qwik_downloaded_${userKey}`;

  // Check persistent local storage for downloaded status
  useEffect(() => {
    if (isSender) {
      setIsDownloaded(true);
      return;
    }

    try {
      const savedPrimary = JSON.parse(localStorage.getItem(primaryStorageKey) || '[]');
      const savedLegacy = JSON.parse(localStorage.getItem(legacyStorageKey) || '[]');
      const savedList = Array.from(new Set([...savedPrimary, ...savedLegacy]));
      
      if (resolvedMsgId && savedList.includes(resolvedMsgId)) {
        setIsDownloaded(true);
      }
    } catch (e) {
      console.warn('Storage check error:', e);
    }
  }, [resolvedMsgId, isSender, primaryStorageKey, legacyStorageKey]);

  // Handle Download Click
  const handleDownloadClick = (e) => {
    e.stopPropagation();
    if (isDownloading || isDownloaded) return;

    setIsDownloading(true);
    setDownloadProgress(20);

    // Realistic WhatsApp download simulation with buffer caching
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          setTimeout(() => {
            // Save to localStorage under both keys for maximum resilience
            try {
              const currentList = JSON.parse(localStorage.getItem(primaryStorageKey) || '[]');
              if (resolvedMsgId && !currentList.includes(resolvedMsgId)) {
                currentList.push(resolvedMsgId);
                localStorage.setItem(primaryStorageKey, JSON.stringify(currentList));
                localStorage.setItem(legacyStorageKey, JSON.stringify(currentList));
              }
            } catch (err) {
              console.warn('Cache write notice:', err);
            }

            setIsDownloading(false);
            setIsDownloaded(true);
          }, 300);
          return 100;
        }
        return prev + 30;
      });
    }, 180);
  };

  const isVideo =
    msg.mediaType === 'video' ||
    msg.type === 'video' ||
    /\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i.test(msg?.mediaUrl || '');

  const mediaSource = msg.mediaUrl || msg.imageUrl || msg.videoUrl;
  const fileSizeLabel = msg.fileSize || (isVideo ? '2.4 MB' : '850 KB');

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10 group select-none min-h-[160px] max-h-80 flex items-center justify-center">
      
      {/* 1. MEDIA DISPLAY (IMAGE / VIDEO) */}
      {isVideo ? (
        <video
          src={mediaSource}
          controls={isDownloaded}
          playsInline
          className={`w-full max-h-80 object-cover rounded-2xl transition-all duration-500 ${
            !isDownloaded ? 'blur-xl brightness-40 scale-105 pointer-events-none' : 'blur-0 brightness-100 scale-100'
          }`}
        />
      ) : (
        <img
          src={mediaSource}
          alt="Media"
          className={`w-full max-h-80 object-cover rounded-2xl transition-all duration-500 ${
            !isDownloaded ? 'blur-xl brightness-40 scale-105 pointer-events-none' : 'blur-0 brightness-100 scale-100'
          }`}
          loading="lazy"
        />
      )}

      {/* 2. RECEIVER DOWNLOAD OVERLAY (IF NOT DOWNLOADED) */}
      {!isDownloaded && (
        <div
          onClick={handleDownloadClick}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 cursor-pointer bg-black/35 hover:bg-black/45 backdrop-blur-sm transition-all"
        >
          {/* Circular WhatsApp Download Button */}
          <div className="relative flex items-center justify-center">
            {/* Outer Progress Ring when downloading */}
            {isDownloading && (
              <div className="absolute inset-0 -m-1.5 rounded-full border-2 border-teal-400/30 border-t-teal-400 animate-spin" />
            )}

            <div className="w-13 h-13 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 shadow-2xl transition-transform active:scale-95 group-hover:scale-105">
              {isDownloading ? (
                <span className="text-[11px] font-black font-mono text-teal-400">
                  {downloadProgress}%
                </span>
              ) : (
                <svg className="w-6 h-6 stroke-[2.5] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
            </div>
          </div>

          {/* Media Info Pill */}
          <div className="px-3 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md flex items-center gap-1.5 text-[11px] font-mono text-white/90 shadow-md">
            <span>{isVideo ? '🎥' : '📷'}</span>
            <span className="font-bold">{fileSizeLabel}</span>
          </div>
        </div>
      )}

      {/* 3. DOWNLOADED BADGE (Subtle indicator for receiver) */}
      {isDownloaded && !isSender && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-md text-[10px] text-white/80 font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          ✓ Cached
        </div>
      )}
    </div>
  );
}
