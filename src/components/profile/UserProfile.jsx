import React, { useState } from 'react';
import { motion } from 'framer-motion';

// Dummy icons to mock interface rendering requirements
const SunIcon = () => <span>☀️</span>;
const ZoomIcon = () => <span>🔍</span>;

const UserProfile = ({ isOpen, onClose, userProfile, currentUser }) => {
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  if (!isOpen) return null;

  const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Logged In User';

  return (
    // 1. CRITICAL CONTAINER FRAME: Full-screen, transparent safety net
    <div className="min-h-screen w-full fixed inset-0 z-[9999] pointer-events-none select-none box-border">
      
      {/* 2. THE ABSOLUTE FLEX CENTER context DIV: This is what forces true central alignment */}
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        
        {/* 3. The focused glassmorphic modal - Surgically central! */}
        <motion.div 
          className="w-full max-w-[560px] md:max-w-[620px] bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative pointer-events-auto border-t-2 border-teal-500/30 flex flex-col box-border"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {/* Header context (Left-aligned as in screenshot) */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/80">
            <h3 className="text-xl md:text-2xl font-bold text-white tracking-wide">Edit Profile Photo</h3>
            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-white transition-colors cursor-pointer text-lg p-1 font-bold"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8 py-2">
            {/* Left Column context - Circular Avatar with accent frame */}
            <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-teal-500/40 bg-slate-955 shadow-inner shrink-0 flex items-center justify-center group">
              <img 
                src={currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName)}&background=0F172A&color=2DD4BF&bold=true`} 
                alt="Avatar" 
                className="w-full h-full object-cover" 
                style={{
                  filter: `brightness(${brightness}%)`,
                  transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`
                }}
              />
            </div>

            {/* Right Column context - Controls */}
            <div className="flex-grow w-full flex flex-col space-y-5">
              {/* Zoom control */}
              <div className="flex flex-col space-y-1.5">
                <label className="flex justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><ZoomIcon /> Zoom Scale</span>
                  <span className="text-teal-400">{Math.round(zoom * 100)}%</span>
                </label>
                <input 
                  type="range" min="1" max="2" step="0.05" value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
              </div>

              {/* Brightness control */}
              <div className="flex flex-col space-y-1.5">
                <label className="flex justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><SunIcon /> Brightness</span>
                  <span className="text-teal-400">{brightness}%</span>
                </label>
                <input 
                  type="range" min="50" max="150" value={brightness} 
                  onChange={(e) => setBrightness(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
              </div>

              {/* Reset positioning joystick triggers */}
              <div className="flex justify-end">
                <button
                  onClick={() => { setZoom(1); setBrightness(100); setPosition({ x: 0, y: 0 }); }}
                  className="text-xs text-teal-400 hover:text-teal-300 underline cursor-pointer"
                >
                  Reset Avatar Settings
                </button>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs md:text-sm uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:brightness-110 text-white font-bold text-xs md:text-sm uppercase tracking-wider shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>

            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
};

export default UserProfile;
