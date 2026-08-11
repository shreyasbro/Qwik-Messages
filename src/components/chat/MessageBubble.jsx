import React, { useState, useEffect, useRef } from 'react';
import { safeString } from '../../utils/safeRender';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../firebaseConfig';
import AudioMessageBubble from './AudioMessageBubble';

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
  onStartSelectMode,
  isGroup = false
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

  const touchTimer = useRef(null);
  const isLongPress = useRef(false);

  const handleTouchStart = (e) => {
    if (isSelectMode) return;
    isLongPress.current = false;
    touchTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(60);
      }
      setMenuOpen(true);
    }, 500);
  };

  const handleTouchEnd = (e) => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleTouchMove = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.8 }} 
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={handleBubbleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!isSelectMode) setMenuOpen(true);
      }}
      className={`w-full flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1.5 px-2 items-end select-none touch-none touch-pan-y`}
    >

      <div 
        className={`flex items-end gap-2 w-fit box-border ${
          isMe ? 'flex-row-reverse' : 'flex-row'
        } ${
          message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))
            ? 'max-w-[95%]'
            : 'max-w-[75%] md:max-w-[65%]'
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
          className={`relative px-4 py-2.5 rounded-3xl shadow-md text-sm transition-all h-auto min-h-0 w-fit min-w-[110px] flex flex-col box-border shrink-0 break-words [word-break:break-word] ${
            message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))
              ? 'max-w-[95%] bg-transparent border-0 shadow-none !p-0'
              : isMe 
                ? 'bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 text-slate-950 font-medium rounded-br-none shadow-teal-500/20 max-w-[85%] sm:max-w-[75%] md:max-w-[65%]' 
                : 'bg-slate-900/90 text-slate-100 border border-slate-800/80 rounded-bl-none max-w-[85%] sm:max-w-[75%] md:max-w-[65%]'
          }`}
          style={{
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            KhtmlUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            userSelect: 'none'
          }}
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

          {/* Group Chat Sender Name Tag */}
          {isGroup && !isMe && message.senderName && (
            <span className="text-[10px] font-black text-teal-400 mb-1.5 block text-left uppercase tracking-wider">
              {message.senderName}
            </span>
          )}

          {/* TEXT PAYLOAD / CONDITIONAL MEDIA RENDERER */}
          {message.messageType === "media" && message.mediaUrl ? (
            <div className="mb-1.5 rounded-xl overflow-hidden bg-slate-950/40 border border-black/10">
              {message.mediaUrl.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl.includes("/audio/") || message.text?.endsWith(".mp3") ? (
                <AudioMessageBubble 
                  message={message}
                  isMe={isMe}
                  resolvedPhotoUrl={resolvedPhotoUrl}
                  senderDisplayName={senderDisplayName}
                />
              ) : message.mediaUrl.match(/\.(mp4|webm)$/i) || message.mediaUrl.includes("/video/") ? (
                <video 
                  controls 
                  preload="metadata"
                  className="w-full max-h-72 rounded-lg object-contain bg-black"
                >
                  <source src={message.mediaUrl} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer">
                  <img 
                    src={message.mediaUrl} 
                    alt="Uploaded attachment" 
                    className="w-full max-h-72 object-cover rounded-lg hover:scale-[1.01] transition-transform duration-200 cursor-pointer"
                    loading="lazy"
                  />
                </a>
              )}
            </div>
          ) : null}

          {/* TEXT CAPTION / FALLBACK */}
          {messageText && !messageText.startsWith("📎 Sent a file:") && (
            <p className="leading-relaxed font-sans text-inherit pr-2 [word-break:break-word] break-words break-all whitespace-pre-wrap m-0 p-0 block w-full">
              {messageText}
            </p>
          )}

          {/* TIMESTAMP SHIELD */}
          {!(message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))) && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] leading-none whitespace-nowrap shrink-0 self-end ${
              isMe ? 'text-slate-950 font-bold' : 'text-slate-400'
            }`}>
              {message.isEdited && <span className="italic mr-1 text-[9px]">(edited)</span>}
              <span className="inline-block whitespace-nowrap">
                {message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
              </span>
              {isMe && (
                <span className="ml-1 flex items-center shrink-0">
                  {message.status === 'read' ? (
                    <svg className="w-3.5 h-3.5 text-cyan-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L7 17l-5-5" />
                      <path d="M22 10l-7.5 7.5L13 16" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-slate-950/80 drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </span>
              )}
            </div>
          )}

             {/* 3-Dot Trigger Button & Context Menu (Inside relative Bubble Container) */}
             {!isSelectMode && (
               <div className="absolute top-1 right-1 z-30 cursor-pointer" ref={menuRef}>
                 <button
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     setMenuOpen(!menuOpen);
                   }}
                   className="p-1.5 rounded-full text-white bg-black/20 hover:bg-black/40 backdrop-blur-sm drop-shadow-md transition-all duration-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center cursor-pointer"
                   title="Message Options"
                   aria-label="Message Options"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                     <circle cx="12" cy="5" r="1"></circle>
                     <circle cx="12" cy="12" r="1"></circle>
                     <circle cx="12" cy="19" r="1"></circle>
                   </svg>
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

                    {/* Copy to Clipboard */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await navigator.clipboard.writeText(messageText);
                          console.log("Message copied to clipboard");
                        } catch (err) {
                          console.error("Failed to copy text: ", err);
                        }
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                      Copy
                    </button>

                    {/* Star Message */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log("Toggling Star for message:", message.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>
                      Star
                    </button>

                    {/* Pin Message */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log("Toggling Pin for message:", message.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                      Pin
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
