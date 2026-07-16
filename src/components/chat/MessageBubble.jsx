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

  const isMe = isOwn; // Map local parameter naming

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.8 }} 
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={handleBubbleClick}
      className={`w-full flex ${isMe ? 'justify-end' : 'justify-start'} mb-2 px-2`}
    >
      <div className={`flex items-end gap-2 max-w-[75%] md:max-w-[65%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Bubble Container with STRICT Production Contrast */}
        <div 
          className={`relative px-4 py-2.5 rounded-2xl shadow-md text-sm break-words ${
            isMe 
              ? 'bg-emerald-600 text-white font-normal rounded-br-none shadow-emerald-900/20' // Enforced solid emerald & white text
              : 'bg-slate-800 text-slate-100 font-normal border border-slate-700/60 rounded-bl-none' // Enforced slate & light text
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

          {/* Enforced visible text payload */}
          <p className="leading-relaxed whitespace-pre-wrap text-inherit font-sans">
            {message.text || message.content || ''}
          </p>

          {/* Timestamp & Edit status */}
          <div className={`flex items-center gap-1 mt-1 text-[10px] ${isMe ? 'text-emerald-100 justify-end' : 'text-slate-400 justify-start'}`}>
            {message.isEdited && <span className="italic">(edited)</span>}
            <span>
              {message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
            </span>
          </div>
        </div>
      </div>
      
      {/* 3-Dot Trigger Button & Context Menu (Moved Outside Bubble Container for Correct Overlay Positioning) */}
      {!isSelectMode && (
        <div className="relative flex items-center self-center" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="text-slate-400 hover:text-white px-2 py-0.5 text-xl font-black cursor-pointer leading-none hover:scale-125 active:scale-90 transition-all select-none inline-block"
            title="Message Actions"
            aria-label="Message Actions"
          >
            ⋮
          </button>

          {/* Action Dropdown Menu Container */}
          {menuOpen && (
            <div className={`absolute top-8 ${isMe ? 'right-0' : 'left-0'} w-40 bg-[#0B111E] border border-slate-700/80 rounded-2xl shadow-2xl z-[9999] py-1.5 flex flex-col text-xs font-semibold text-slate-200 animate-in fade-in zoom-in-95 duration-150 select-none overflow-hidden`}>
              {/* Reply */}
              <button
                onClick={() => {
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
                  onClick={() => {
                    onEdit(message);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>✏️</span> Edit
                </button>
              )}

              {/* Select */}
              <button
                onClick={() => {
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
                onClick={() => {
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
                  onClick={() => {
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
    </motion.div>
  );
}
