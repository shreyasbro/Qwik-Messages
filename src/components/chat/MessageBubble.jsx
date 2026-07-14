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

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.8 }} 
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={handleBubbleClick}
      className={`flex items-center gap-2 mb-3 relative w-full ${isOwn ? 'justify-end' : 'justify-start'} ${isSelectMode ? 'cursor-pointer select-none' : ''}`}
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

      {/* Message Bubble Container */}
      <div className={`relative max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
        isOwn 
          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-none' 
          : 'bg-[#1E293B] text-slate-100 border border-slate-700/60 rounded-tl-none'
      }`}>
        
        {/* Quoted Reply Banner */}
        {message.replyTo && (
          <div className="mb-2 p-2 rounded-lg bg-black/30 border-l-2 border-emerald-400 text-xs text-slate-300">
            <p className="font-bold text-[10px] text-emerald-400 mb-0.5">
              Reply to {safeString(message.replyTo.senderName)}
            </p>
            <p className="truncate opacity-80">{safeString(message.replyTo.text)}</p>
          </div>
        )}

        {/* Message Text */}
        <p className="break-words font-medium leading-relaxed mb-1">
          {safeString(message.text, safeString(message))}
        </p>
        
        {/* Message Footer Info */}
        <div className="flex items-center justify-between gap-4 mt-1.5">
          <span className="text-[9px] text-slate-300 opacity-60 font-semibold flex items-center gap-1">
            {formatTimeSafe(message.timestamp || message.createdAt)}
            {message.isEdited && (
              <span className="text-[8px] text-emerald-400 italic font-bold">(edited)</span>
            )}
          </span>

          {/* 3-Dot Trigger Button & Context Menu (Inside Bubble Padding) */}
          {!isSelectMode && (
            <div className="relative flex items-center" ref={menuRef}>
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
                <div className={`absolute top-8 ${isOwn ? 'right-0' : 'left-0'} w-40 bg-[#0B111E] border border-slate-700/80 rounded-2xl shadow-2xl z-[9999] py-1.5 flex flex-col text-xs font-semibold text-slate-200 animate-in fade-in zoom-in-95 duration-150 select-none overflow-hidden`}>
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
                  {isOwn && (
                    <button
                      onClick={() => {
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
                  {isOwn && (
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
        </div>
      </div>
    </motion.div>
  );
}
