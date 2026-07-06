import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function CallModal({ isOpen, onClose, recipient, chatId }) {
  const { currentUser } = useAuth();

  if (!isOpen || !recipient) return null;

  const roomName = `qwik-messages-${chatId}`;
  const myName = currentUser?.displayName || 'User';

  return (
    <div className="fixed inset-0 z-50 w-screen h-[100dvh] bg-slate-950/95 backdrop-blur-xl flex flex-col p-4 select-none">
      
      {/* Top Banner Control Rail */}
      <div className="flex items-center justify-between bg-[#0B111E] border border-slate-800 rounded-2xl p-4 mb-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
          <div>
            <h3 className="text-sm font-black text-white">
              Secure HD Call Node
            </h3>
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
              Connected with {recipient.displayName || 'Peer'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-rose-900 rounded-xl transition-colors cursor-pointer"
        >
          Disconnect Call
        </button>
      </div>

      {/* Frame Container */}
      <div className="flex-1 bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden relative shadow-2xl">
        <iframe
          src={`https://meet.jit.si/${roomName}#userInfo.displayName="${encodeURIComponent(myName)}"`}
          className="w-full h-full border-none"
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          title="HD Video Stream"
        />
      </div>

    </div>
  );
}
