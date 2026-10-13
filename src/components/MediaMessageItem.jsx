import React from 'react';
import { useLocalMedia } from '../hooks/useLocalMedia';

export default function MediaMessageItem({ msg, isSender, currentUser }) {
  const { isLocal, localUrl, isDownloading, downloadProgress, download, source } = useLocalMedia(
    msg,
    isSender
  );

  const isVideo =
    msg.mediaType === 'video' ||
    msg.type === 'video' ||
    /\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i.test(msg?.mediaUrl || '');

  const effectiveMediaSource = localUrl || msg.mediaUrl || msg.imageUrl || msg.videoUrl;
  const fileSizeLabel = msg.fileSize || (isVideo ? '2.4 MB' : '850 KB');

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10 group select-none min-h-[160px] max-h-80 flex items-center justify-center">
      {/* 1. MEDIA DISPLAY (IMAGE / VIDEO) */}
      {isVideo ? (
        <video
          src={effectiveMediaSource}
          controls={isLocal}
          playsInline
          className={`w-full max-h-80 object-cover rounded-2xl transition-all duration-500 ${
            !isLocal
              ? 'blur-xl brightness-40 scale-105 pointer-events-none'
              : 'blur-0 brightness-100 scale-100'
          }`}
        />
      ) : (
        <img
          src={effectiveMediaSource}
          alt={msg.fileName || 'Media'}
          className={`w-full max-h-80 object-cover rounded-2xl transition-all duration-500 ${
            !isLocal
              ? 'blur-xl brightness-40 scale-105 pointer-events-none'
              : 'blur-0 brightness-100 scale-100'
          }`}
          loading="lazy"
        />
      )}

      {/* 2. RECEIVER DOWNLOAD OVERLAY (IF NOT AVAILABLE LOCALLY) */}
      {!isLocal && (
        <div
          onClick={download}
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

      {/* 3. LOCAL MEDIA REUSE BADGE */}
      {isLocal && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/65 border border-white/15 backdrop-blur-md text-[10px] text-teal-300 font-mono shadow-sm flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span>{source === 'device_folder' ? '💾 Device File' : '📱 Available on this device'}</span>
        </div>
      )}
    </div>
  );
}
