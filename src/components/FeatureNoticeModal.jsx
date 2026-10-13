import React from 'react';

export default function FeatureNoticeModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[800] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200"
      >
        {/* Animated Mic & Pulse Icon */}
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 shadow-lg shadow-teal-500/10">
            <svg className="w-7 h-7 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-teal-500"></span>
          </span>
        </div>

        {/* Text Content */}
        <div className="space-y-1.5">
          <h3 className="text-base font-black text-white">Voice Notes In Beta</h3>
          <p className="text-xs text-gray-400 leading-relaxed px-2">
            We are currently testing this feature to make sure you have a smooth and seamless experience.
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-gray-950 font-black text-xs transition-transform active:scale-95 cursor-pointer shadow-lg shadow-teal-500/20"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
