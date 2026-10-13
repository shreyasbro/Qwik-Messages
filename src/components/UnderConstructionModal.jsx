import React, { useState } from 'react';

export default function UnderConstructionModal({ isOpen = true, onClose }) {
  const [copied, setCopied] = useState(false);
  const supportEmail = "qwik.messages.official@gmail.com";

  if (!isOpen) return null;

  const handleCopyEmail = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      className="fixed inset-0 z-[1000000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-300"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0B111E] border border-teal-500/30 rounded-3xl shadow-[0_0_50px_rgba(13,148,136,0.15)] flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-300"
      >
        {/* Top Glowing Gradient Accent Bar */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 shadow-sm shadow-teal-400/50" />

        {/* Ambient Corner Glow Orbs */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Cyber Background Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0d94880a_1px,transparent_1px),linear-gradient(to_bottom,#0d94880a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {/* MODAL CONTENT CONTAINER */}
        <div className="relative p-6 sm:p-8 flex flex-col items-center text-center gap-5 z-10">
          
          {/* Glowing Animated Icon Badge */}
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-teal-500/20 via-emerald-500/10 to-transparent text-teal-300 flex items-center justify-center border border-teal-500/40 shadow-xl shadow-teal-500/10 backdrop-blur-sm">
              <span className="text-3xl sm:text-4xl filter drop-shadow-md">⚡</span>
            </div>
            {/* Pulsing Live Beacon */}
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-teal-500 border-2 border-[#0B111E]" />
            </span>
          </div>

          {/* Title & Live Status Indicator */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-950/80 border border-teal-500/40 text-teal-300 text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-sm">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span>Development Break</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-sm">
              DEVELOPMENT <span className="bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">BREAK</span>
            </h2>
          </div>

          {/* Body Copy */}
          <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed px-1 sm:px-4">
            <p className="font-medium">
              The developer is currently on a planned development break. New major feature rollouts are paused temporarily while infrastructure is being stabilized.
            </p>
            <div className="p-3 rounded-2xl bg-teal-950/30 border border-teal-500/20 text-[11px] sm:text-xs text-teal-200/90 flex items-center justify-center gap-2">
              <span className="text-sm">🛡️</span>
              <span>All existing chats, audio/video calls, and security features remain <strong>100% live & usable</strong> for testing!</span>
            </div>
          </div>

          {/* Direct Support & Feedback Card */}
          <div className="w-full p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Official Inquiries & Feedback</p>
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-xs font-mono font-bold text-teal-400 hover:text-teal-300 transition-colors truncate block"
                >
                  {supportEmail}
                </a>
              </div>
            </div>

            {/* Quick Copy Button */}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="w-full sm:w-auto px-3 py-2 rounded-xl bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 hover:text-white border border-teal-500/30 text-[11px] font-black transition-all active:scale-95 cursor-pointer shrink-0"
              title="Copy official email address"
            >
              {copied ? '✅ Copied' : '📋 Copy'}
            </button>
          </div>

          {/* High-Impact Action Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 hover:from-teal-400 hover:via-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm tracking-wider uppercase shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
          >
            Launch Qwik Messages 🚀
          </button>

        </div>
      </div>
    </div>
  );
}
