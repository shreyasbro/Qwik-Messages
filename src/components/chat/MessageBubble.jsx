import React, { useState, useEffect, useRef } from 'react';
import { safeString } from '../../utils/safeRender';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../firebaseConfig';

export default function MessageBubble({ 
  message, 
  currentUser, 
  onReply, 
  onEdit, 
  onDeleteForMe, 
  onDeleteForEveryone,
  formatTimeSafe,
  isSelectMode,
  isSelected,
  onSelectToggle,
  onStartSelectMode
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  
  const currentUid = currentUser?.uid || auth?.currentUser?.uid;
  const isOwn = Boolean(currentUid && message?.senderId === currentUid);
  const isMe = isOwn; // Enforce early scope declaration to prevent TDZ ReferenceError

  // CRITICAL PRODUCTION SHIELD: Guarantee valid text payload (prevents blank green bricks on Live!)
  const messageText = message?.text || message?.content || message?.message || '';
  if (!messageText.trim() && !message?.imageUrl && !message?.fileUrl) {
    return null; // Don't render empty ghost bubbles if payload is completely missing
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleBubbleClick = (e) => {
    if (isSelectMode) {
      e.stopPropagation();
      onSelectToggle(message.id);
    }
  };

  const getHighlightClass = () => {
    if (!isSelected) return '';
    return isMe 
      ? 'bg-emerald-500/10' 
      : 'bg-slate-700/50';
  };

  // CRITICAL: Strict Multi-Stage Fallback context
  const getAvatarUrl = () => {
    // 1. DATABASE PAYLOAD: Best case scenario (often null on Magic Link login)
    if (message.photoURL) return message.photoURL;
    if (message.senderPhoto) return message.senderPhoto; // Check legacy fields

    // 2. CONTEXT FALLBACK: If payload is missing, check auth context as fallback for self
    if (isMe && currentUser?.photoURL) return currentUser.photoURL;

    // 3. ENTERPRISE INITIALS FALLBACK: The critical fix
    // If no URL exists, we must dynamically generate standard initials based on senderName.
    const name = message.senderName || message.displayName || message.senderEmail?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F172A&color=2DD4BF&bold=true`;
  };

  const resolvedPhotoUrl = getAvatarUrl();
  const senderDisplayName = message.senderName || message.displayName || message.senderEmail?.split('@')[0] || 'User';

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.8 }} 
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={handleBubbleClick}
      className={`w-full flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1.5 px-2 items-end gap-2 select-none`}
    >
      {/* LEFT AVATAR NODE (For Incoming Messages Only) */}
      {!isMe && (
        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-slate-700/80 bg-slate-800 flex items-center justify-center shadow-sm mb-0.5 select-none">
          <img src={resolvedPhotoUrl} alt={senderDisplayName} className="w-full h-full object-cover" />
        </div>
      )}

      <div 
        className={`flex items-end gap-2 max-w-[75%] md:max-w-[65%] w-fit box-border ${
          isMe ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        
        {/* Checkbox Indicator for Select Mode */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ opacity: 0, scale: 0, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 28 }}
              exit={{ opacity: 0, scale: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center flex-shrink-0"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                isSelected 
                  ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-black text-[10px]' 
                  : 'border-slate-600 hover:border-emerald-400'
              }`}>
                {isSelected && '✓'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bubble Container - relative context */}
        <div 
          className={`relative px-4 py-2.5 rounded-2xl shadow-md text-sm transition-transform h-auto min-h-0 w-fit min-w-[110px] max-w-[75%] md:max-w-[65%] flex flex-col box-border shrink-0 ${
            isMe 
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-none shadow-emerald-900/20' 
              : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-none'
          }`}
        >

          {/* Quoted Reply Banner */}
          {message.replyTo && (
            <div className="mb-2 p-2 rounded-lg bg-black/30 border-l-2 border-emerald-400 text-xs text-slate-300">
              <p className="font-bold text-[10px] text-emerald-400 mb-0.5">
                Reply to {safeString(message.replyTo.senderName)}
              </p>
              <p className="truncate opacity-80">{safeString(message.replyTo.text)}</p>
            </div>
          )}

          {/* TEXT PAYLOAD - Uses standard break-words & whitespace-pre-wrap for natural WhatsApp stretching */}
          <p className="leading-relaxed font-sans text-inherit pr-2 [word-break:break-word] break-words break-all whitespace-pre-wrap m-0 p-0 block w-full">
            {messageText}
          </p>

          {/* TIMESTAMP SHIELD - Uses self-end and whitespace-nowrap so time strictly holds bottom-right without vertical wrapping */}
          <div className={`flex items-center gap-1 mt-1 text-[10px] leading-none whitespace-nowrap shrink-0 self-end ${
            isMe ? 'text-emerald-100' : 'text-slate-400'
          }`}>
            {message.isEdited && <span className="italic mr-1 text-[9px]">(edited)</span>}
            <span className="inline-block whitespace-nowrap font-medium">
              {message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
            </span>
          </div>

            {/* 3-Dot Trigger Button & Context Menu (Inside relative Bubble Container) */}
            {!isSelectMode && (
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full z-30 cursor-pointer" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  className="text-slate-400 hover:text-white text-lg font-black leading-none hover:scale-110 active:scale-95 transition-all select-none inline-block px-1"
                  title="Message Actions"
                  aria-label="Message Actions"
                >
                  ⋮
                </button>

                {/* Action Dropdown Menu Container */}
                {menuOpen && (
                  <div className={`absolute top-6 ${isMe ? 'right-0' : 'left-0'} w-40 bg-[#0B111E] border border-slate-700/80 rounded-2xl shadow-2xl z-[9999] py-1.5 flex flex-col text-xs font-semibold text-slate-200 animate-in fade-in zoom-in-95 duration-150 select-none overflow-hidden`}>
                    {/* Reply */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReply(message);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span>↩️</span> Reply
                    </button>

                    {/* Edit (Own Only) */}
                    {isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(message);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <span>✏️</span> Edit
                      </button>
                    )}

                    {/* Select */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartSelectMode(message.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span>☑️</span> Select
                    </button>

                    <div className="h-px bg-slate-800/80 my-1 mx-2" />

                    {/* Delete for Me */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteForMe(message.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span>🗑️</span> Delete for Me
                    </button>

                    {/* Delete for Everyone (Own Only) */}
                    {isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteForEveryone(message.id);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-rose-500 hover:bg-rose-950/50 hover:text-rose-400 transition-colors flex items-center gap-2 font-bold cursor-pointer"
                      >
                        <span>💥</span> Delete for All
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}
