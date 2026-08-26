import React from 'react';

export default function DevelopmentModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-gray-950 border border-teal-800 rounded-3xl overflow-hidden shadow-2xl shadow-teal-950/20 flex flex-col p-6 text-center animate-in zoom-in-50 duration-300">
        
        {/* Cinematic Header Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center border-2 border-teal-400 animate-pulse">
            <svg className="w-9 h-9 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
            </svg>
          </div>
        </div>

        {/* Cinematic Text */}
        <h2 className="text-xl font-extrabold text-white mb-2 tracking-tight drop-shadow-sm">
          Cinematic Development In Progress
        </h2>
        <p className="text-xs text-gray-400 mb-6 px-3">
          Our team is currently perfecting the microphone and recording experience. Hold on tight, great things are coming soon!
        </p>
        
        {/* Cinematic Underline */}
        <div className="w-1/3 h-1 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full mx-auto mb-6 shadow-lg shadow-teal-500/20" />

        {/* Cinematic Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 shadow-lg shadow-teal-500/20 hover:scale-[1.02] transition-transform active:scale-95 cursor-pointer"
        >
          Sounds Epic, Let's Wait
        </button>
      </div>
    </div>
  );
}
