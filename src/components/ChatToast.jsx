import React from 'react';

export default function ChatToast({ message, type = 'success', onClose }) {
  if (!message) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none select-none">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-900/95 backdrop-blur-md border border-teal-500/40 text-white rounded-2xl shadow-2xl shadow-black/80">
        <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-xs font-semibold tracking-wide">{message}</span>
      </div>
    </div>
  );
}
