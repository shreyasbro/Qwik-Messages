import React, { useState, useEffect, useRef } from 'react';
import { doc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { userService } from '../../services/userService';

export default function StatusViewerModal({ isOpen, onClose, currentUser, statuses = [], onAddStatus }) {
  const [activeUserIdx, setActiveUserIdx] = useState(0);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const timerRef = useRef(null);

  // 1. GROUP STATUSES BY USER
  const userMap = {};
  (statuses || []).forEach((st) => {
    const uid = st.userId || 'unknown';
    if (!userMap[uid]) {
      const uName = st.userName || (uid === currentUser?.uid ? (currentUser?.displayName || 'My Account') : 'Contact');
      const uAvatar = st.userAvatar || (uid === currentUser?.uid ? userService.resolveAvatar(currentUser) : userService.resolveAvatar({ uid, displayName: uName }));
      userMap[uid] = {
        userId: uid,
        userName: uName,
        userAvatar: uAvatar,
        stories: [],
      };
    }
    userMap[uid].stories.push({
      id: st.id,
      type: st.type || (st.mediaUrl || st.imageUrl || st.url || st.image ? 'image' : 'text'),
      text: st.text || st.caption || st.content || '',
      mediaUrl: st.mediaUrl || st.imageUrl || st.url || st.image || '',
      bgColor: st.bgColor || 'linear-gradient(135deg, #0d9488 0%, #064e3b 100%)',
      createdAt: st.createdAt,
    });
  });

  const myGroup = userMap[currentUser?.uid] || null;
  const otherGroups = Object.values(userMap).filter((u) => u.userId !== currentUser?.uid);
  
  // Put Current User first, followed by other contacts
  const allUserGroups = myGroup ? [myGroup, ...otherGroups] : otherGroups;

  const currentUserGroup = allUserGroups[activeUserIdx] || allUserGroups[0] || null;
  const currentStories = currentUserGroup?.stories || [];
  const activeStory = currentStories[activeStoryIdx] || currentStories[0] || null;

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveUserIdx(0);
      setActiveStoryIdx(0);
      setProgress(0);
      setIsPaused(false);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  // 5-Second Timer
  useEffect(() => {
    if (!isOpen || !activeStory || isPaused) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + 2; // 100ms * 50 = 5000ms
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, activeUserIdx, activeStoryIdx, isPaused, currentStories.length]);

  const handleNext = () => {
    setProgress(0);
    // Case 1: Next story in same user
    if (activeStoryIdx < currentStories.length - 1) {
      setActiveStoryIdx((prev) => prev + 1);
    } 
    // Case 2: Jump to Next User's first story
    else if (activeUserIdx < allUserGroups.length - 1) {
      setActiveUserIdx((prev) => prev + 1);
      setActiveStoryIdx(0);
    } 
    // Case 3: Finished all stories of all users
    else {
      handleClose();
    }
  };

  const handlePrev = () => {
    setProgress(0);
    // Case 1: Prev story in same user
    if (activeStoryIdx > 0) {
      setActiveStoryIdx((prev) => prev - 1);
    } 
    // Case 2: Jump to Previous User's last story
    else if (activeUserIdx > 0) {
      const prevUser = allUserGroups[activeUserIdx - 1];
      setActiveUserIdx((prev) => prev - 1);
      setActiveStoryIdx(prevUser.stories.length - 1);
    }
  };

  const handleSelectUser = (index) => {
    setProgress(0);
    setActiveUserIdx(index);
    setActiveStoryIdx(0);
  };

  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setActiveUserIdx(0);
    setActiveStoryIdx(0);
    setProgress(0);
    onClose();
  };

  const handleDeleteStory = async (storyId) => {
    if (!storyId) return;
    try {
      await deleteDoc(doc(db, 'statuses', storyId));
      if (currentStories.length <= 1) {
        handleClose();
      } else {
        handleNext();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !currentUserGroup?.userId) return;

    try {
      setReplyText('');
      alert(`Replied to ${currentUserGroup.userName}'s status!`);
    } catch (err) {
      console.error('Reply error:', err);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      const tag = e.target.tagName?.toUpperCase();
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (isInput) return;

      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeUserIdx, activeStoryIdx, allUserGroups.length]);

  if (!isOpen || allUserGroups.length === 0 || !activeStory) return null;

  const isMe = currentUserGroup?.userId === currentUser?.uid;

  return (
    <div 
      onClick={handleClose}
      className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-between p-3 sm:p-5 select-none animate-in fade-in duration-150"
    >
      {/* 1. TOP STORIES TRAY (SWITCH BETWEEN USERS) */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-3 overflow-x-auto max-w-lg w-full py-1.5 px-3 z-30 no-scrollbar justify-center"
      >
        {allUserGroups.map((group, idx) => {
          const isSelected = activeUserIdx === idx;
          return (
            <button
              key={group.userId}
              type="button"
              onClick={() => handleSelectUser(idx)}
              className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group"
            >
              <div
                className={`p-0.5 rounded-full transition-all duration-200 ${
                  isSelected
                    ? 'bg-gradient-to-tr from-teal-400 via-emerald-400 to-cyan-500 scale-110 shadow-lg shadow-teal-500/20'
                    : 'bg-gray-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img
                  src={group.userAvatar}
                  alt={group.userName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-gray-950"
                />
              </div>
              <span className={`text-[10px] truncate max-w-[60px] ${isSelected ? 'text-teal-300 font-bold' : 'text-gray-400'}`}>
                {group.userId === currentUser?.uid ? 'You' : group.userName.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. CENTER STORY CARD WITH SIDE ARROWS */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="relative flex items-center justify-center w-full max-w-xl my-auto"
      >
        {/* PREV USER/STORY CHEVRON */}
        {(activeUserIdx > 0 || activeStoryIdx > 0) && (
          <button
            type="button"
            onClick={handlePrev}
            className="hidden sm:flex absolute -left-12 p-3 rounded-full bg-gray-900/80 hover:bg-teal-500 text-white hover:text-gray-950 transition-all z-40 shadow-xl cursor-pointer"
            title="Previous (Left Arrow)"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* ACTIVE STORY CONTAINER */}
        <div
          className="relative w-full max-w-[400px] h-[75vh] max-h-[680px] bg-gray-950 rounded-3xl overflow-hidden shadow-2xl border border-gray-800/90 flex flex-col justify-between"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {/* PROGRESS BARS */}
          <div className="absolute top-3 inset-x-3 z-40 flex items-center gap-1.5">
            {currentStories.map((_, idx) => (
              <div key={idx} className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-400 transition-all duration-100 ease-linear"
                  style={{
                    width:
                      idx < activeStoryIdx
                        ? '100%'
                        : idx === activeStoryIdx
                        ? `${progress}%`
                        : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* STORY HEADER */}
          <div className="absolute top-6 inset-x-3 z-40 flex items-center justify-between p-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent rounded-t-2xl text-white">
            <div className="flex items-center gap-2.5">
              <img
                src={currentUserGroup?.userAvatar}
                alt=""
                className="w-9 h-9 rounded-full object-cover border-2 border-teal-400 shadow-md"
              />
              <div>
                <h4 className="text-xs font-bold truncate max-w-[140px]">
                  {currentUserGroup?.userName}
                </h4>
                <span className="text-[10px] text-gray-300 opacity-80">
                  {activeStoryIdx + 1} of {currentStories.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isMe && onAddStatus && (
                <button
                  type="button"
                  onClick={() => { handleClose(); onAddStatus(); }}
                  className="px-2 py-1 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  + Add
                </button>
              )}

              {isMe && (
                <button
                  type="button"
                  onClick={() => handleDeleteStory(activeStory.id)}
                  className="p-1.5 rounded-full hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <svg className="w-4 h-4 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors ml-1 cursor-pointer"
                title="Close (Esc)"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* STORY CANVAS */}
          <div className="flex-1 relative flex items-center justify-center bg-gray-950 overflow-hidden">
            {activeStory.type === 'text' || !activeStory.mediaUrl ? (
              <div
                className="w-full h-full flex items-center justify-center p-8 text-center"
                style={{ background: activeStory.bgColor }}
              >
                <p className="text-2xl font-extrabold text-white leading-relaxed break-words max-w-sm drop-shadow-md">
                  {activeStory.text}
                </p>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col justify-center items-center bg-black relative">
                <img
                  src={activeStory.mediaUrl}
                  alt="Story"
                  className="w-full h-full object-contain"
                />
                {activeStory.text && (
                  <div className="absolute bottom-3 inset-x-3 p-2.5 bg-black/80 backdrop-blur-md rounded-2xl text-white text-center text-xs font-semibold z-20">
                    {activeStory.text}
                  </div>
                )}
              </div>
            )}

            {/* TOUCH / TAP ZONES */}
            <div onClick={handlePrev} className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer" />
            <div onClick={handleNext} className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer" />
          </div>

          {/* BOTTOM REPLY BAR (FOR CONTACTS' STORIES) */}
          {!isMe && (
            <form onSubmit={handleSendReply} className="p-3 bg-gray-950/95 border-t border-gray-800/80 z-40 flex items-center gap-2">
              <input
                type="text"
                placeholder={`Reply to ${currentUserGroup?.userName?.split(' ')[0]}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="flex-1 px-3.5 py-1.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold transition-all shadow-md cursor-pointer"
              >
                <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          )}

        </div>

        {/* NEXT USER/STORY CHEVRON */}
        {(activeUserIdx < allUserGroups.length - 1 || activeStoryIdx < currentStories.length - 1) && (
          <button
            type="button"
            onClick={handleNext}
            className="hidden sm:flex absolute -right-12 p-3 rounded-full bg-gray-900/80 hover:bg-teal-500 text-white hover:text-gray-950 transition-all z-40 shadow-xl cursor-pointer"
            title="Next (Right Arrow)"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* FOOTER INFO */}
      <div className="text-[11px] text-gray-500">
        Tap left or right to navigate • Press Esc to exit
      </div>
    </div>
  );
}
