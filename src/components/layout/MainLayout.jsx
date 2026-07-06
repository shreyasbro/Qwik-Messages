import React from 'react';
import ChatSidebar from '../chat/ChatSidebar';
import ChatWindow from '../chat/ChatWindow';
import { useCall } from '../../context/CallContext';
import { useAuth } from '../../context/AuthContext';
import JitsiCallWindow from '../calling/JitsiCallWindow';

export default function MainLayout() {
  const { incomingCall, activeCall, acceptCall, declineCall, endCall } = useCall();
  const { currentUser } = useAuth();

  return (
    <div className="w-screen h-[100dvh] flex bg-slate-950 overflow-hidden relative">
      
      {/* Sidebar - left */}
      <ChatSidebar />

      {/* Conversation Workspace - right */}
      <ChatWindow />

      {/* Global Incoming Call Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
            {/* Top green pulse bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 animate-pulse"></div>

            {/* Pulsing Avatar Container */}
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping"></div>
              <img 
                src={incomingCall.hostAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(incomingCall.hostName)}&background=0d9488&color=fff&bold=true`} 
                alt={incomingCall.hostName} 
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 relative z-10"
              />
            </div>

            <h3 className="text-lg font-black text-white tracking-wide">{incomingCall.hostName}</h3>
            <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider mt-1 mb-6">
              Incoming {incomingCall.type === 'video' ? 'Video' : 'Audio'} Call...
            </p>

            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={() => declineCall(incomingCall.callId)}
                className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-rose-400 border border-rose-900 bg-rose-950/20 hover:bg-rose-950/40 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Decline
              </button>
              <button
                onClick={() => acceptCall(incomingCall.callId)}
                className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Window */}
      {activeCall && (
        <JitsiCallWindow
          callData={activeCall}
          currentUser={currentUser}
          onClose={() => endCall(activeCall.callId)}
        />
      )}

    </div>
  );
}
