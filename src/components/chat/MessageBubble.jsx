import React, { useState, useEffect, useRef } from 'react';
import { safeString } from '../../utils/safeRender';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../firebaseConfig';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import AudioMessageBubble from './AudioMessageBubble';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { getCachedDocument, saveCachedDocument } from '../../utils/documentStorage';

const SUGGESTED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

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
  isGroup = false,
  chatId,
  onShowToast
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const reactionMenuRef = useRef(null);
  const pickerRef = useRef(null);
  
  const currentUid = currentUser?.uid || auth?.currentUser?.uid;
  const isOwn = Boolean(currentUid && message?.senderId === currentUid);
  const isMe = isOwn; // Enforce early scope declaration to prevent TDZ ReferenceError

  // Helper: Trigger Toast Popup
  const triggerToast = (text) => {
    if (onShowToast) onShowToast(text);
  };

  // 1. DOWNLOAD / SAVE MEDIA (NATIVE MOBILE SAVE TO GALLERY & DESKTOP FALLBACK)
  const handleDownloadMedia = async (e) => {
    if (e) e.stopPropagation();
    if (!message.mediaUrl) return;
    setMenuOpen(false);
    triggerToast('Downloading media...');

    try {
      const res = await fetch(message.mediaUrl);
      const rawBlob = await res.blob();

      const fileExt = message.fileExt || (message.type === 'image' ? 'jpg' : message.type === 'video' ? 'mp4' : 'mp3');
      let mimeType = rawBlob.type || (message.type === 'image' ? 'image/jpeg' : message.type === 'video' ? 'video/mp4' : message.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream');
      const fileName = message.fileName || `Qwik_${message.type || 'media'}_${Date.now()}.${fileExt}`;

      const typedBlob = new Blob([rawBlob], { type: mimeType });
      const file = new File([typedBlob], fileName, { type: mimeType });

      // 1. MOBILE NATIVE SAVE (Supports direct Save to Gallery / Camera Roll)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: fileName,
            text: 'Save media from Qwik Messages',
          });
          triggerToast('Media shared / saved!');
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return; // User closed share sheet
          console.warn('Native share failed, falling back to blob download:', shareErr);
        }
      }

      // 2. DESKTOP / DIRECT BROWSER DOWNLOAD FALLBACK
      const objectUrl = window.URL.createObjectURL(typedBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      triggerToast('Download complete!');
    } catch (err) {
      console.error('Download failed:', err);
      window.open(message.mediaUrl, '_blank');
      triggerToast('Opening media in new tab');
    }
  };

  // 2. COPY MESSAGE / MEDIA LINK
  const handleCopyMessage = async () => {
    setMenuOpen(false);
    try {
      const contentToCopy = message.text || message.content || message.message || message.mediaUrl || '';
      if (!contentToCopy) return;
      await navigator.clipboard.writeText(contentToCopy);
      triggerToast('Copied to clipboard!');
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // 3. TOGGLE STAR
  const handleToggleStar = async () => {
    setMenuOpen(false);
    if (!chatId || !message.id || !currentUid) return;

    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', message.id);
      const isStarred = message.starredBy?.includes(currentUid);

      await updateDoc(msgRef, {
        starredBy: isStarred ? arrayRemove(currentUid) : arrayUnion(currentUid),
      });

      triggerToast(isStarred ? 'Removed from Starred' : 'Message Starred ⭐');
    } catch (err) {
      console.error('Star failed:', err);
    }
  };

  // 4. PIN MESSAGE TO CHAT HEADER
  const handlePinMessage = async () => {
    setMenuOpen(false);
    if (!chatId || !message.id) return;

    try {
      const chatRef = doc(db, 'chats', chatId);
      const previewText = message.text || (message.type === 'image' ? '📷 Photo' : message.type === 'document' ? '📄 Document' : message.type === 'poll' ? '📊 Poll' : '📎 Attachment');

      await updateDoc(chatRef, {
        pinnedMessage: {
          id: message.id,
          text: previewText,
          senderName: message.senderName || message.displayName || 'User',
        },
      });

      triggerToast('Message pinned to chat 📌');
    } catch (err) {
      console.error('Pin failed:', err);
    }
  };

  // 5. REPLY TRIGGER
  const handleReplyMessage = () => {
    setMenuOpen(false);
    if (onReply) onReply(message);
    triggerToast(`Replying to ${message.senderName || 'message'}`);
  };

  // 6. EDIT TRIGGER
  const handleEditMessage = () => {
    setMenuOpen(false);
    if (onEdit) onEdit(message);
  };

  // 7. SELECT TRIGGER
  const handleSelectMessage = () => {
    setMenuOpen(false);
    if (onStartSelectMode) onStartSelectMode(message.id);
    triggerToast('Multi-select mode enabled');
  };

  // 8. DELETE FOR ME
  const handleDeleteForMeAction = async () => {
    setMenuOpen(false);
    if (onDeleteForMe) {
      onDeleteForMe(message.id);
      triggerToast('Deleted for you');
    }
  };

  // 9. DELETE FOR EVERYONE
  const handleDeleteForEveryoneAction = async () => {
    setMenuOpen(false);
    if (onDeleteForEveryone) {
      onDeleteForEveryone(message.id);
      triggerToast('Message deleted for everyone');
    }
  };

  // DOCUMENT VIEW & PERSISTENT DOWNLOAD CACHE LIFECYCLE
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'downloaded'
  const fileKey = message?.id || message?.mediaUrl;

  // 1. CHECK PERSISTENT CACHE ON MOUNT
  useEffect(() => {
    if (message?.type === 'document' && fileKey) {
      getCachedDocument(fileKey).then((cached) => {
        if (cached && cached.blob) {
          setDownloadState('downloaded');
        }
      });
    }
  }, [fileKey, message?.type]);

  // 2. DOWNLOAD AND PERSIST TO INDEXEDDB
  const handleDownloadFile = async (e) => {
    if (e) e.stopPropagation();
    if (downloadState === 'downloading') return;

    try {
      setDownloadState('downloading');
      triggerToast('Downloading document...');
      const response = await fetch(message.mediaUrl);
      const rawBlob = await response.blob();

      // Ensure proper MIME type on the cached blob
      let mimeType = rawBlob.type;
      const fileExt = (message.fileName || '').split('.').pop().toLowerCase();
      if (!mimeType || mimeType === 'application/octet-stream') {
        if (fileExt === 'pdf') mimeType = 'application/pdf';
        else if (fileExt === 'txt') mimeType = 'text/plain';
      }
      const typedBlob = new Blob([rawBlob], { type: mimeType });

      // Save binary blob to persistent IndexedDB
      await saveCachedDocument(fileKey, typedBlob, message.fileName || 'document');
      setDownloadState('downloaded');

      // Trigger automatic save to device
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(typedBlob);
      link.download = message.fileName || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
      triggerToast('Document saved to device!');
    } catch (err) {
      console.error('Download and cache failed:', err);
      setDownloadState('idle');
      window.open(message.mediaUrl, '_blank');
    }
  };

  // 3. INSTANT OPEN FROM LOCAL CACHE
  const handleOpenDocument = async (e) => {
    if (e) e.stopPropagation();
    const fileExt = (message.fileExt || message.fileName?.split('.').pop() || '').toLowerCase();

    try {
      const cached = await getCachedDocument(fileKey);
      if (cached && cached.blob) {
        // If PDF or Plain text, open locally cached blob directly
        if (['pdf', 'txt'].includes(fileExt)) {
          const localUrl = window.URL.createObjectURL(cached.blob);
          window.open(localUrl, '_blank');
          return;
        }
      }
    } catch (err) {
      console.warn("Could not retrieve local blob, falling back:", err);
    }

    // If DOC, DOCX, or Office document, open via Google Docs Viewer
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(fileExt)) {
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(message.mediaUrl)}&embedded=false`;
      window.open(viewerUrl, '_blank');
      return;
    }

    window.open(message.mediaUrl, '_blank');
  };

  // 4. REAL-TIME POLL VOTING HANDLER
  const handleVote = async (optionId) => {
    if (!message?.poll || !chatId || !currentUser) return;

    const currentUserId = currentUser.uid;
    const allowMultiple = message.poll.allowMultiple;

    // Clone options and update voter arrays
    const updatedOptions = (message.poll.options || []).map((opt) => {
      const voters = opt.voters || [];
      const isVotedThis = voters.includes(currentUserId);

      if (opt.id === optionId) {
        // Toggle vote for selected option
        const newVoters = isVotedThis
          ? voters.filter((id) => id !== currentUserId)
          : [...voters, currentUserId];
        return { ...opt, voters: newVoters };
      } else {
        // If single-vote mode and user voted for a different option, remove them from that option
        if (!allowMultiple) {
          return { ...opt, voters: voters.filter((id) => id !== currentUserId) };
        }
        return opt;
      }
    });

    // Calculate unique total voters
    const uniqueVoterSet = new Set();
    updatedOptions.forEach((opt) => (opt.voters || []).forEach((id) => uniqueVoterSet.add(id)));

    try {
      const messageDocRef = doc(db, 'chats', chatId, 'messages', message.id);
      await updateDoc(messageDocRef, {
        'poll.options': updatedOptions,
        'poll.totalVotes': uniqueVoterSet.size,
      });
      triggerToast('Vote recorded!');
    } catch (err) {
      console.error('Failed to submit vote:', err);
    }
  };

  // CRITICAL PRODUCTION SHIELD: Guarantee valid text payload (prevents blank green bricks on Live!)
  const messageText = message?.text || message?.content || message?.message || '';
  const isMessageEmpty = !messageText.trim() && !message?.imageUrl && !message?.fileUrl && !message?.mediaUrl && message?.type !== 'poll';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      const clickedOutsideReactionMenu = !reactionMenuRef.current || !reactionMenuRef.current.contains(event.target);
      const clickedOutsidePicker = !pickerRef.current || !pickerRef.current.contains(event.target);
      
      if (clickedOutsideReactionMenu && clickedOutsidePicker) {
        setShowReactionMenu(false);
        setShowCustomPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggle reaction in Firestore
  const handleToggleReaction = async (emoji) => {
    if (!chatId || !message.id || !currentUid) return;

    setShowReactionMenu(false);
    setShowCustomPicker(false);

    const messageRef = doc(db, "chats", chatId, "messages", message.id);
    const userList = message.reactions?.[emoji] || [];
    const hasReacted = userList.includes(currentUid);

    try {
      if (hasReacted) {
        // Remove reaction
        await updateDoc(messageRef, {
          [`reactions.${emoji}`]: arrayRemove(currentUid)
        });
      } else {
        // Add reaction
        await updateDoc(messageRef, {
          [`reactions.${emoji}`]: arrayUnion(currentUid)
        });
      }
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const activeReactions = Object.entries(message.reactions || {}).filter(
    ([_, users]) => users && users.length > 0
  );

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
        window.navigator.vibrate(40);
      }
      setShowReactionMenu(true);
    }, 400);
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

  if (isMessageEmpty) return null;

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
          message.type === 'poll'
            ? 'w-[300px] sm:w-[360px] md:w-[400px] max-w-full'
            : message.type === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'].includes(message.fileExt)
            ? 'w-[300px] sm:w-[370px] md:w-[410px] max-w-full'
            : message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))
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

        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full relative ${
          message.type === 'poll' || message.type === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'].includes(message.fileExt)
            ? 'w-full'
            : ''
        }`}>
          
          {/* FLOATING ACTION TRIGGER (ON HOVER) */}
          {!isSelectMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowReactionMenu(!showReactionMenu);
              }}
              className={`absolute top-1/2 -translate-y-1/2 ${
                isMe ? '-left-8' : '-right-8'
              } opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 shadow-md z-30 cursor-pointer`}
              title="React"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* FLOATING REACTION POPUP BAR */}
          {showReactionMenu && (
            <div 
              ref={reactionMenuRef}
              className={`absolute -top-12 ${isMe ? 'right-0' : 'left-0'} z-50 flex items-center gap-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-2 py-1.5 rounded-full shadow-2xl animate-in fade-in zoom-in-95 duration-150`}
            >
              {/* Quick Suggested Emojis */}
              {SUGGESTED_EMOJIS.map((emoji) => {
                const hasReacted = message.reactions?.[emoji]?.includes(currentUid);
                return (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleReaction(emoji);
                    }}
                    className={`w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform rounded-full cursor-pointer ${
                      hasReacted ? 'bg-teal-500/20 ring-1 ring-teal-400' : 'hover:bg-white/10'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}

              {/* Custom Emoji (+) Button */}
              <div className="relative border-l border-slate-700 pl-1 ml-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCustomPicker(!showCustomPicker);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-white transition-colors text-sm font-bold cursor-pointer"
                  title="More Emojis"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* FULL EMOJI PICKER MODAL (AUTO-POSITIONED - DETACHED FROM PILL LAYOUT) */}
          {showCustomPicker && (
            <div 
              ref={pickerRef}
              className={`fixed inset-x-4 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0 sm:inset-auto sm:absolute sm:bottom-12 ${
                isMe ? 'sm:right-0' : 'sm:left-0'
              } z-[80] shadow-2xl flex justify-center`}
            >
              <div className="overflow-hidden rounded-2xl border border-slate-700 shadow-2xl scale-90 sm:scale-100 origin-bottom">
                <EmojiPicker 
                  lazyLoadEmojis={true} 
                  onEmojiClick={(emojiData) => handleToggleReaction(emojiData.emoji)}
                  searchPlaceHolder="Search reaction emoji..." 
                  theme={Theme.DARK}
                  width={320}
                  height={400}
                />
              </div>
            </div>
          )}

          {/* Bubble Container - relative context */}
          <div 
            className={`relative rounded-3xl shadow-md text-sm transition-all h-auto min-h-0 flex flex-col box-border shrink-0 break-words [word-break:break-word] ${
              message.type === 'poll' || message.type === 'sticker'
                ? 'w-full !p-0 bg-transparent border-0 shadow-none'
                : message.type === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'].includes(message.fileExt)
                ? 'w-full p-2'
                : 'px-4 py-2.5 w-fit min-w-[110px]'
            } ${
              message.type === 'poll' || message.type === 'sticker'
                ? ''
                : message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))
                ? 'max-w-[95%] bg-transparent border-0 shadow-none !p-0'
                : isMe 
                  ? 'bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 text-slate-950 font-medium rounded-br-none shadow-teal-500/20' 
                  : 'bg-slate-900/90 text-slate-100 border border-slate-800/80 rounded-bl-none'
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

          {/* TELEGRAM-STYLE POLL CARD RENDERER */}
          {message.type === 'poll' && message.poll && (
            <div className="w-full p-4 bg-gray-950/95 rounded-2xl border border-white/10 shadow-2xl select-none text-left">
              {/* Question & Badge */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <h4 className="text-sm font-bold text-white leading-snug break-words">
                  {message.poll.question}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold text-[10px] shrink-0 border border-teal-500/30">
                  {message.poll.allowMultiple ? 'Multiple Poll' : 'Poll'}
                </span>
              </div>

              {/* Options List */}
              <div className="space-y-2 mb-3">
                {(message.poll.options || []).map((option) => {
                  const isVoted = option.voters?.includes(currentUser?.uid);
                  const voteCount = option.voters?.length || 0;
                  const totalVotesCount = message.poll.totalVotes || 0;
                  const percentage = totalVotesCount > 0 ? Math.round((voteCount / totalVotesCount) * 100) : 0;

                  return (
                    <div
                      key={option.id}
                      onClick={() => handleVote(option.id)}
                      className={`relative overflow-hidden rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
                        isVoted
                          ? 'border-teal-500 bg-teal-950/40 text-white shadow-sm'
                          : 'border-gray-800/90 bg-gray-900/60 hover:bg-gray-800/80 text-gray-200'
                      }`}
                    >
                      {/* Animated Percentage Fill Bar (Telegram Style) */}
                      {totalVotesCount > 0 && (
                        <div
                          className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out pointer-events-none ${
                            isVoted ? 'bg-teal-500/25' : 'bg-white/10'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      )}

                      {/* Option Content */}
                      <div className="relative z-10 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Radio/Checkbox indicator */}
                          <div
                            className={`w-4 h-4 rounded-${
                              message.poll.allowMultiple ? 'md' : 'full'
                            } flex items-center justify-center border shrink-0 transition-colors ${
                              isVoted ? 'bg-teal-500 border-teal-400 text-gray-950' : 'border-gray-600 bg-gray-800'
                            }`}
                          >
                            {isVoted && (
                              <svg className="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="font-semibold truncate">{option.text}</span>
                        </div>

                        {/* Percentage & Vote Count */}
                        {totalVotesCount > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0 font-bold">
                            <span className={isVoted ? 'text-teal-300' : 'text-gray-400'}>{percentage}%</span>
                            <span className="text-[10px] text-gray-500 font-normal">({voteCount})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Info */}
              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-900">
                <span>
                  {message.poll.totalVotes === 1 ? '1 person voted' : `${message.poll.totalVotes || 0} people voted`}
                </span>
                <span className="text-gray-500 italic">Tap to vote or change</span>
              </div>
            </div>
          )}

          {/* TEXT PAYLOAD / CONDITIONAL MEDIA RENDERER */}
          {message.messageType === "media" && message.mediaUrl ? (
            <div className="mb-1.5 rounded-xl overflow-hidden bg-slate-950/40 border border-black/10 w-full">
              {message.type === 'document' || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'].includes(message.fileExt) ? (
                <div className="w-full flex items-center justify-between gap-3 p-3 bg-gray-950/85 hover:bg-gray-950 rounded-xl border border-white/10 shadow-lg select-none">
                  
                  {/* Extension Type Badge */}
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold uppercase text-[10px] text-white shadow-md ${
                    message.fileExt === 'pdf' 
                      ? 'bg-gradient-to-br from-rose-500 to-rose-700' 
                      : ['doc', 'docx'].includes(message.fileExt)
                      ? 'bg-gradient-to-br from-blue-500 to-blue-700'
                      : 'bg-gradient-to-br from-teal-500 to-emerald-700'
                  }`}>
                    <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>{message.fileExt || 'DOC'}</span>
                  </div>

                  {/* File Details (Stretched and Non-Wrapping) */}
                  <div className="flex-1 min-w-0 pr-1 text-left">
                    <div 
                      className="text-xs font-semibold text-white truncate max-w-[150px] sm:max-w-[200px] md:max-w-[230px]" 
                      title={message.fileName || "Document"}
                    >
                      {message.fileName || "Document File"}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5 whitespace-nowrap">
                      <span>{message.fileSize || "File"}</span>
                      <span>•</span>
                      <span className={`capitalize font-medium ${
                        downloadState === 'downloaded' ? 'text-teal-400 font-semibold' : 'text-gray-400'
                      }`}>
                        {downloadState === 'downloaded' ? 'Downloaded' : message.fileExt || 'File'}
                      </span>
                    </div>
                  </div>

                  {/* Download / Open Action Button */}
                  <div className="shrink-0">
                    {downloadState === 'downloaded' ? (
                      <button
                        type="button"
                        onClick={handleOpenDocument}
                        className="px-3 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                        title="Open Document"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>OPEN</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={downloadState === 'downloading'}
                        onClick={handleDownloadFile}
                        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
                        title="Download Document"
                      >
                        {downloadState === 'downloading' ? (
                          <svg className="animate-spin w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                </div>
              ) : message.mediaUrl.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl.includes("/audio/") || message.text?.endsWith(".mp3") ? (
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
              ) : message.type === 'sticker' ? (
                /* GIPHY STICKER (NO BACKGROUND BUBBLE) */
                <div className="w-36 h-36 select-none p-1 flex items-center justify-center">
                  <img
                    src={message.mediaUrl}
                    alt="sticker"
                    className="w-full h-full object-contain filter drop-shadow-lg hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                </div>
              ) : message.type === 'gif' ? (
                /* GIPHY GIF */
                <div className="rounded-2xl overflow-hidden max-w-xs shadow-xl border border-white/10 bg-black/40">
                  <img
                    src={message.mediaUrl}
                    alt="gif"
                    className="w-full h-full object-cover max-h-64 hover:scale-[1.01] transition-transform"
                    loading="lazy"
                  />
                </div>
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

          {/* TEXT CAPTION / FALLBACK (Skip for Stickers & GIFs) */}
          {messageText && message.type !== 'sticker' && message.type !== 'gif' && !messageText.startsWith("📎 Sent a file:") && (
            <p className="leading-relaxed font-sans text-inherit pr-2 [word-break:break-word] break-words break-all whitespace-pre-wrap m-0 p-0 block w-full">
              {messageText}
            </p>
          )}

          {/* TIMESTAMP SHIELD */}
          {!(message.messageType === "media" && (message.mediaUrl?.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || message.mediaUrl?.includes("/audio/") || message.text?.endsWith(".mp3"))) && (
            <div className={`flex items-center gap-1 mt-1 text-[10px] leading-none whitespace-nowrap shrink-0 self-end ${
              isMe ? 'text-slate-950 font-bold' : 'text-slate-400'
            }`}>
              {/* Starred Badge Indicator */}
              {message.starredBy?.includes(currentUid) && (
                <span className="text-amber-400 text-xs mr-0.5" title="Starred Message">★</span>
              )}
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
                  <div className={`absolute top-6 ${isMe ? 'right-0' : 'left-0'} w-44 bg-gray-950/95 backdrop-blur-md border border-gray-800/90 rounded-2xl shadow-2xl z-[9999] p-1.5 flex flex-col gap-0.5 text-xs font-semibold text-gray-200 animate-in fade-in zoom-in-95 duration-100 select-none`}>
                    {/* 1. Reply */}
                    <button
                      type="button"
                      onClick={handleReplyMessage}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      <span>Reply</span>
                    </button>

                    {/* 2. Download (for images, videos, audio & documents) */}
                    {Boolean(message.mediaUrl || ['image', 'video', 'audio', 'document'].includes(message.type)) && (
                      <button
                        type="button"
                        onClick={handleDownloadMedia}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 hover:text-teal-200 rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Download</span>
                      </button>
                    )}

                    {/* 3. Copy (Text / Media Link) */}
                    {message.type !== 'poll' && (
                      <button
                        type="button"
                        onClick={handleCopyMessage}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                    )}

                    {/* 4. Star / Unstar */}
                    {message.type !== 'poll' && (
                      <button
                        type="button"
                        onClick={handleToggleStar}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 text-amber-400 shrink-0" fill={message.starredBy?.includes(currentUid) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        <span>{message.starredBy?.includes(currentUid) ? 'Unstar' : 'Star'}</span>
                      </button>
                    )}

                    {/* 5. Pin */}
                    <button
                      type="button"
                      onClick={handlePinMessage}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <svg className="w-4 h-4 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span>Pin</span>
                    </button>

                    {/* 6. Edit (Own text messages only) */}
                    {message.type !== 'poll' && isMe && (
                      <button
                        type="button"
                        onClick={handleEditMessage}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Edit</span>
                      </button>
                    )}

                    {/* 7. Select */}
                    <button
                      type="button"
                      onClick={handleSelectMessage}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800/80 hover:text-white rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Select</span>
                    </button>

                    <div className="h-px bg-gray-800/80 my-1 mx-1" />

                    {/* 8. Delete for Me */}
                    <button
                      type="button"
                      onClick={handleDeleteForMeAction}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete for Me</span>
                    </button>

                    {/* 9. Delete for Everyone (Sender only) */}
                    {isMe && (
                      <button
                        type="button"
                        onClick={handleDeleteForEveryoneAction}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors font-bold cursor-pointer text-left"
                      >
                        <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Delete for All</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ATTACHED REACTION BADGES (BOTTOM PILLS) */}
          {activeReactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {activeReactions.map(([emoji, users]) => {
                const hasReacted = users.includes(currentUid);
                return (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleReaction(emoji);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      hasReacted
                        ? 'bg-teal-500/15 border-teal-500/50 text-teal-300 ring-1 ring-teal-500/30'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                    title={users.length > 1 ? `${users.length} reactions` : '1 reaction'}
                  >
                    <span>{emoji}</span>
                    {users.length > 1 && <span>{users.length}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
