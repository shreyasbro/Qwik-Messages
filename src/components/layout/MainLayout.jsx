import React, { useState, useEffect } from 'react';
import ChatSidebar from '../chat/ChatSidebar';
import ChatWindow from '../chat/ChatWindow';
import { useCall } from '../../context/CallContext';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import JitsiCallWindow from '../calling/JitsiCallWindow';

function IncomingCallPanel({ incomingCall, onDecline, onAccept }) {
  const [callStatus, setCallStatus] = useState('ringing'); // 'ringing' | 'busy'

  useEffect(() => {
    // 60 seconds (1 minute) auto-busy timer
    const timeout = setTimeout(() => {
      setCallStatus('busy');
      
      // Auto-close modal after 3 seconds so user can read the message
      const closeTimeout = setTimeout(() => {
        onDecline();
      }, 3000);

      return () => clearTimeout(closeTimeout);
    }, 60000);

    return () => clearTimeout(timeout);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
        {/* Top green pulse bar */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${callStatus === 'ringing' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>

        {/* Pulsing Avatar Container */}
        <div className="relative mb-4">
          {callStatus === 'ringing' && (
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping"></div>
          )}
          <img 
            src={incomingCall.hostAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(incomingCall.hostName)}&background=0d9488&color=fff&bold=true`} 
            alt={incomingCall.hostName} 
            className={`w-20 h-20 rounded-full object-cover border-2 relative z-10 ${callStatus === 'ringing' ? 'border-emerald-500' : 'border-red-500'}`}
          />
        </div>

        {callStatus === 'ringing' ? (
          <>
            <h3 className="text-lg font-black text-white tracking-wide">{incomingCall.hostName}</h3>
            <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider mt-1 mb-6">
              Incoming {incomingCall.type === 'video' ? 'Video' : 'Audio'} Call...
            </p>

            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={onDecline}
                className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-rose-400 border border-rose-900 bg-rose-950/20 hover:bg-rose-950/40 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Decline
              </button>
              <button
                onClick={onAccept}
                className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Accept
              </button>
            </div>
          </>
        ) : (
          <div className="py-4">
            <h2 className="text-white text-lg font-black tracking-wide">"It's look like your friend is busy"</h2>
            <p className="text-slate-400 text-xs mt-2 font-bold uppercase tracking-wider animate-pulse">Disconnecting call...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MainLayout() {
  const { incomingCall, activeCall, acceptCall, declineCall, endCall } = useCall();
  const { currentUser } = useAuth();

  const { activeMobileTab } = useChat();

  return (
    <div className="h-[100dvh] w-full flex bg-slate-950 overflow-hidden fixed inset-0">
      
      {/* Sidebar - left */}
      <div className={`w-full md:w-[350px] lg:w-[400px] h-full shrink-0 ${activeMobileTab === 'sidebar' ? 'block' : 'hidden md:block'}`}>
        <ChatSidebar />
      </div>

      {/* Conversation Workspace - right */}
      <div className={`flex-1 h-full min-w-0 ${activeMobileTab === 'chat' ? 'block' : 'hidden md:block'}`}>
        <ChatWindow />
      </div>

      {/* Global Incoming Call Overlay */}
      {incomingCall && (() => {
        // We use an IIFE/Inline Component to track timer state specifically for the active incomingCall doc
        return <IncomingCallPanel 
          incomingCall={incomingCall} 
          onDecline={() => declineCall(incomingCall.callId)} 
          onAccept={() => acceptCall(incomingCall.callId)} 
        />;
      })()}

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
