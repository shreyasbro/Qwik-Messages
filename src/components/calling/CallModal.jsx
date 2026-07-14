import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function CallModal({ isOpen, onClose, recipient, chatId, isConnected = false }) {
  const { currentUser } = useAuth();

  if (!isOpen || !recipient) return null;

  const roomName = `qwik-messages-${chatId}`;
  const myName = currentUser?.displayName || 'User';

  // Determine if this is a group call
  const isGroup = recipient?.isGroup ?? (Array.isArray(recipient?.members) && recipient.members.length > 1);
  const displayName = isGroup
    ? (recipient?.displayName || recipient?.name || 'Group Call')
    : (recipient?.displayName || recipient?.name || 'Personal Call');
  const avatarUrl = recipient?.photoURL || recipient?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0d9488&color=fff&bold=true`;

  // Conditional wrapper based on connection state
  return (
    <div className={isConnected ? "fixed inset-0 z-50 w-screen h-[100dvh] bg-slate-950/95 backdrop-blur-xl flex flex-col p-4 select-none" : "fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in"}>
      {isConnected ? (
        <>
          {/* Top Banner Control Rail */}
          <div className="flex items-center justify-between bg-[#0B111E] border border-slate-800 rounded-2xl p-4 mb-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-teal-500">
                <img src={avatarUrl} alt="Recipient Avatar" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">{displayName}</h3>
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Connected with {displayName}</p>
              </div>
            </div>
            <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-rose-900 rounded-xl transition-colors cursor-pointer">Disconnect Call</button>
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
        </>
      ) : (
        <div className="w-full max-w-sm bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 shadow-2xl shadow-teal-500/10 flex flex-col items-center justify-center animate-scale-up">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-teal-500 mb-4 bg-slate-800 flex items-center justify-center">
            <img src={avatarUrl} alt="Calling avatar" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-teal-500/10 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide mb-1 text-center">{displayName}</h3>
          <p className="text-xs font-semibold text-teal-400 tracking-widest uppercase animate-pulse mb-6">Calling {displayName}...</p>
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-rose-600/20 border border-rose-500/50 text-rose-400 font-bold text-sm tracking-wider hover:bg-rose-600 hover:text-white transition shadow-lg shadow-rose-600/20">CANCEL CALL</button>
        </div>
      )}
    </div>
  );
}
