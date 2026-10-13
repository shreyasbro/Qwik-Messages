import React, { useState } from 'react';

const CURRENT_VERSION = 'v2.4.0';

export default function ChangelogUpdatesModal({ isOpen, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleCloseModal = () => {
    if (dontShowAgain) {
      localStorage.setItem('qwik_seen_changelog_version', CURRENT_VERSION);
    }
    onClose();
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCloseModal();
      }}
      className="fixed inset-0 z-[850] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[88vh] bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-950 via-teal-950/30 to-gray-950">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 shadow-lg shadow-teal-500/10">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">Qwik Updates & Roadmap</h3>
                <span className="text-[10px] font-mono font-black text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-500/30">
                  {CURRENT_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Explore what's new, in beta, and coming next</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-900 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          
          {/* SECTION 1: NEW UPDATES (LIVE NOW) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                1. New Updates (Live Now)
              </h4>
            </div>

            <div className="grid gap-2.5">
              {/* Voice & Video Calling (LIVE) */}
              <div className="p-3.5 rounded-2xl bg-gray-900/70 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>📹 HD Voice & Video Calling</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Direct peer-to-peer real-time WebRTC audio and video calling with mic mute, camera toggle, and in-call controls.
                </p>
              </div>

              {/* Granular Privacy Suite (LIVE) */}
              <div className="p-3.5 rounded-2xl bg-gray-900/70 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🛡️ Granular Privacy & "Specific Contacts"</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Control who sees your <strong>Last Seen, Profile Photo, and About Bio</strong> with 4 custom tiers: <em>Everyone, My Contacts, Nobody, and Specific Contacts Picker</em>.
                </p>
              </div>

              {/* App Lock (LIVE) */}
              <div className="p-3.5 rounded-2xl bg-gray-900/70 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🔒 App Lock Security & Password Verification</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Protect Qwik Messages with <strong>4-Digit PIN or Passwords</strong>. Remembers saved credentials and requires security verification before disabling.
                </p>
              </div>

              {/* Disappearing Messages (LIVE) */}
              <div className="p-3.5 rounded-2xl bg-gray-900/70 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>⏳ Default Disappearing Messages</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Set automatic message deletion timers to <strong>24 Hours, 7 Days, or 90 Days</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: ONGOING UPDATES (TESTING & BETA) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-sm shadow-amber-400/50"></span>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">
                2. Ongoing Updates (In Testing & Beta)
              </h4>
            </div>

            <div className="grid gap-2.5">
              <div className="p-3.5 rounded-2xl bg-amber-950/10 border border-amber-500/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🎤 WhatsApp-Style Waveform Voice Notes</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-500/30">
                    Testing Beta
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Recording engine with interactive scrubbing waveforms, 1x/1.5x/2x speed multipliers, and real-time audio playback. Polishing compression and microphone permissions.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-950/10 border border-amber-500/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>⚡ Zero-Domain Transactional Recovery Pipeline</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-500/30">
                    Testing Beta
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Direct client-side verification pipeline with instantaneous PIN reset passkeys and cross-browser email delivery.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: NEXT UPDATES (ROADMAP) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50"></span>
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">
                3. Next Updates (Upcoming Roadmap)
              </h4>
            </div>

            <div className="grid gap-2.5">
              <div className="p-3.5 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🖥️ Live Screen Sharing & Group Video Rooms</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/30">
                    Roadmap
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Share your desktop screen or browser tab during active calls with multi-participant conference grids.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🎨 Custom Chat Wallpapers & Theme Engine</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/30">
                    Roadmap
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Personalize individual chat backgrounds with custom uploaded images or OLED Dark, Cyberpunk, and Matrix presets.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>📊 Channels, Live Broadcasts & Chat Polls</span>
                  </h5>
                  <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/30">
                    Roadmap
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Create public broadcast channels with unlimited subscribers and in-chat interactive voting polls.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-gray-900 border-gray-700 text-teal-500 focus:ring-teal-500 w-4 h-4 cursor-pointer"
            />
            <span>Don't show on login again</span>
          </label>

          <button
            type="button"
            onClick={handleCloseModal}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-gray-950 text-xs font-black transition-transform active:scale-95 cursor-pointer shadow-lg shadow-teal-500/20"
          >
            Explore Qwik 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
