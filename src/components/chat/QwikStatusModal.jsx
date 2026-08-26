import React, { useState, useEffect, useRef } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { optimizeMediaUrl } from '../../utils/imageOptimizer';

export default function QwikStatusModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  statuses = [], 
  usersDirectory = {}, 
  onAddStatus 
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isHoldPaused, setIsHoldPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const timerRef = useRef(null);

  const isPaused = isManualPaused || isHoldPaused;

  const myUid = currentUser?.uid;
  const myName = currentUser?.displayName || currentUser?.name || 'My Status';
  const myAvatar = currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${myUid || 'me'}`;

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 800);
  };

  // Group statuses by user
  const userMap = {};
  (statuses || []).forEach((st) => {
    const uid = st.userId || st.uid;
    if (!uid) return;
    const contactProfile = usersDirectory[uid] || {};

    const resolvedName =
      (uid === myUid ? myName : null) ||
      (st.userName && st.userName !== 'Contact' && st.userName !== 'User' && st.userName !== 'Anonymous' ? st.userName : null) ||
      contactProfile.displayName ||
      contactProfile.name ||
      st.userDisplayName ||
      st.userEmail?.split('@')[0] ||
      contactProfile.email?.split('@')[0] ||
      'Friend';

    const resolvedAvatar =
      (uid === myUid ? myAvatar : null) ||
      (st.userAvatar && !st.userAvatar.includes('seed=') ? st.userAvatar : null) ||
      contactProfile.photoURL ||
      contactProfile.avatar ||
      st.userPhoto ||
      st.userAvatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

    if (!userMap[uid]) {
      userMap[uid] = {
        userId: uid,
        userName: resolvedName,
        userAvatar: resolvedAvatar,
        stories: [],
      };
    }
    userMap[uid].stories.push({
      id: st.id,
      type: st.type || (st.mediaUrl || st.imageUrl || st.content?.startsWith('http') ? 'image' : 'text'),
      text: st.text || st.caption || (st.type === 'text' ? st.content : '') || '',
      mediaUrl: st.mediaUrl || st.imageUrl || (st.type === 'image' ? st.content : '') || '',
      bgColor: st.bgColor || '#0f766e',
      createdAt: st.createdAt,
    });
  });

  const myStatusGroup = userMap[myUid] || null;
  const contactGroups = Object.values(userMap).filter((u) => u.userId !== myUid);

  const activeGroup = selectedUserUid ? userMap[selectedUserUid] : null;
  const activeStories = activeGroup?.stories || [];
  const currentStory = activeStories[currentStoryIndex] || null;

  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setIsManualPaused(false);
      setIsHoldPaused(false);
      setIsClosing(false);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSelectedUserUid(null);
      setCurrentStoryIndex(0);
      setIsManualPaused(false);
      setIsHoldPaused(false);
    }
  }, [isOpen]);

  // Story Progress Timer (Clean Resume on Unpause)
  useEffect(() => {
    if (!isOpen || isClosing || !currentStory || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isClosing, selectedUserUid, currentStoryIndex, isPaused, activeStories.length]);

  // Preload upcoming story
  useEffect(() => {
    if (!activeStories || activeStories.length === 0) return;

    const nextStory = activeStories[currentStoryIndex + 1];
    if (nextStory?.mediaUrl) {
      const preloader = new Image();
      preloader.src = optimizeMediaUrl(nextStory.mediaUrl);
    }
  }, [currentStoryIndex, activeStories]);

  const handleNextStory = () => {
    setProgress(0);
    if (currentStoryIndex < activeStories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
    } else {
      const allContactUids = contactGroups.map((g) => g.userId);
      const currentContactIdx = allContactUids.indexOf(selectedUserUid);

      if (selectedUserUid === myUid && allContactUids.length > 0) {
        setSelectedUserUid(allContactUids[0]);
        setCurrentStoryIndex(0);
      } else if (currentContactIdx !== -1 && currentContactIdx < allContactUids.length - 1) {
        setSelectedUserUid(allContactUids[currentContactIdx + 1]);
        setCurrentStoryIndex(0);
      } else {
        setSelectedUserUid(null);
        setCurrentStoryIndex(0);
      }
    }
  };

  const handlePrevStory = () => {
    setProgress(0);
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
    }
  };

  const handleDeleteStatus = async (storyId) => {
    if (!storyId) return;
    try {
      await deleteDoc(doc(db, 'statuses', storyId));
      if (activeStories.length <= 1) {
        setSelectedUserUid(null);
      } else {
        handleNextStory();
      }
    } catch (err) {
      console.error('Delete status error:', err);
    }
  };

  const handleOpenUserStory = (uid) => {
    setProgress(0);
    setSelectedUserUid(uid);
    setCurrentStoryIndex(0);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedUserUid) setSelectedUserUid(null);
        else handleAnimatedClose();
      }
      if (e.key === 'ArrowRight') handleNextStory();
      if (e.key === 'ArrowLeft') handlePrevStory();
      if (e.key === ' ') {
        e.preventDefault();
        setIsHoldPaused(false);
        setIsManualPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing, selectedUserUid, currentStoryIndex, activeStories.length]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 z-[220] bg-gray-950 flex flex-col md:flex-row select-none overflow-hidden ${
        isClosing ? 'animate-status-circle-out' : 'animate-status-circle-in'
      }`}
    >
      {/* 1. STATUS FEED LIST (VISIBLE ON MOBILE ONLY WHEN NO STORY IS OPEN) */}
      <div
        className={`${
          selectedUserUid ? 'hidden md:flex' : 'flex'
        } w-full md:w-[380px] lg:w-[420px] h-full bg-gray-950 border-r border-gray-800/80 flex-col shrink-0 z-20 ${
          isClosing ? 'animate-status-pane-out' : 'animate-status-pane-in'
        }`}
      >
        {/* Header */}
        <div className="h-16 px-4 bg-gray-900/80 border-b border-gray-800/80 flex items-center justify-between text-gray-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="p-2 rounded-xl bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Close Status (Esc)"
            >
              <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">Status Feed</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onAddStatus}
            className="p-2 rounded-xl bg-teal-500/15 hover:bg-teal-500 text-teal-400 hover:text-gray-950 border border-teal-500/30 font-bold transition-all cursor-pointer"
            title="Create Status"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Status Feed List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
          {/* MY STATUS */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 px-2 block mb-2">
              My Status
            </span>
            <div
              onClick={() => {
                if (myStatusGroup) {
                  handleOpenUserStory(myUid);
                } else {
                  onAddStatus();
                }
              }}
              className={`flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer border transition-all ${
                selectedUserUid === myUid
                  ? 'bg-teal-500/10 border-teal-500/40 shadow-lg shadow-teal-500/5'
                  : 'bg-gray-900/60 hover:bg-gray-900 border-gray-800/80 hover:border-gray-700'
              }`}
            >
              <div className="relative shrink-0">
                <img
                  src={myAvatar}
                  alt={myName}
                  className={`w-12 h-12 rounded-full object-cover p-0.5 ${
                    myStatusGroup ? 'border-2 border-teal-400 shadow-md shadow-teal-500/20' : 'border border-gray-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddStatus();
                  }}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-teal-500 hover:bg-teal-400 text-gray-950 flex items-center justify-center font-black shadow-md cursor-pointer text-xs"
                  title="Add update"
                >
                  +
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white truncate">{myName}</h4>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {myStatusGroup ? `${myStatusGroup.stories.length} active updates` : 'Tap to add status update'}
                </p>
              </div>
            </div>
          </div>

          {/* RECENT UPDATES */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 px-2 block mb-2">
              Recent Updates ({contactGroups.length})
            </span>

            {contactGroups.length > 0 ? (
              <div className="space-y-1.5">
                {contactGroups.map((contact) => (
                  <div
                    key={contact.userId}
                    onClick={() => handleOpenUserStory(contact.userId)}
                    className="flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer border border-gray-800/60 bg-gray-900/30 hover:bg-gray-900/70 hover:border-gray-700 transition-all"
                  >
                    <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-teal-400 via-emerald-400 to-cyan-500 flex items-center justify-center shrink-0">
                      <img
                        src={contact.userAvatar}
                        alt={contact.userName}
                        className="w-full h-full rounded-full object-cover border-2 border-gray-950"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-gray-200 truncate">{contact.userName}</h4>
                      <p className="text-[11px] text-teal-400/80 truncate mt-0.5">
                        {contact.stories.length} new update{contact.stories.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-600 text-xs">
                No recent updates from contacts
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. FULL-SCREEN STORY VIEWER (MOBILE EXPANDED & DESKTOP SPLIT) */}
      <div
        className={`${
          selectedUserUid ? 'flex' : 'hidden md:flex'
        } flex-1 h-full bg-gray-950/95 relative items-center justify-center overflow-hidden p-2 sm:p-4 ${
          isClosing ? 'animate-status-pane-out' : 'animate-status-pane-in'
        }`}
      >
        {currentStory ? (
          <div className="w-full max-w-[440px] h-full max-h-[96vh] md:max-h-[90vh] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between relative border border-gray-800">
            {/* Top Progress Bars */}
            <div className="absolute top-3 inset-x-3 z-40 flex items-center gap-1.5 pointer-events-none">
              {activeStories.map((_, idx) => (
                <div key={idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-400 transition-all duration-100 ease-linear shadow-sm"
                    style={{
                      width:
                        idx < currentStoryIndex
                          ? '100%'
                          : idx === currentStoryIndex
                          ? `${progress}%`
                          : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Header: User Profile & Actions */}
            <div 
              className="absolute top-6 inset-x-3 z-50 flex items-center justify-between p-2.5 bg-gradient-to-b from-gray-950/90 via-gray-950/50 to-transparent rounded-t-2xl text-white"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                {/* Mobile Back to List Arrow */}
                <button
                  type="button"
                  onClick={() => setSelectedUserUid(null)}
                  className="md:hidden p-1.5 rounded-full bg-black/40 text-white cursor-pointer"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <img
                  src={activeGroup?.userAvatar}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border-2 border-teal-400 shadow-md"
                />
                <div>
                  <h4 className="text-xs font-bold truncate max-w-[140px]">
                    {activeGroup?.userName}
                  </h4>
                  <span className="text-[10px] text-gray-400 opacity-90">
                    {currentStoryIndex + 1} of {activeStories.length}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* PLAY / PAUSE BUTTON (WITH EVENT ISOLATION) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHoldPaused(false);
                    setIsManualPaused((prev) => !prev);
                  }}
                  className="p-2 rounded-xl hover:bg-white/15 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title={isPaused ? 'Play' : 'Pause'}
                >
                  {isPaused ? (
                    <svg className="w-4 h-4 fill-current text-teal-400" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 fill-current text-gray-300" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  )}
                </button>

                {selectedUserUid === myUid && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStatus(currentStory.id);
                    }}
                    className="p-1.5 rounded-xl hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete status"
                  >
                    <svg className="w-4 h-4 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUserUid(null);
                  }}
                  className="p-1.5 rounded-xl hover:bg-white/15 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title="Close story"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Media Canvas (HOLD TO PAUSE ATTACHED ONLY TO CANVAS) */}
            <div 
              className="flex-1 relative flex items-center justify-center bg-gray-950 overflow-hidden"
              onMouseDown={() => setIsHoldPaused(true)}
              onMouseUp={() => setIsHoldPaused(false)}
              onTouchStart={() => setIsHoldPaused(true)}
              onTouchEnd={() => setIsHoldPaused(false)}
            >
              {currentStory.type === 'text' || !currentStory.mediaUrl ? (
                <div
                  className="w-full h-full flex items-center justify-center p-8 text-center"
                  style={{ background: currentStory.bgColor }}
                >
                  <p className="text-2xl font-black text-white leading-relaxed break-words max-w-sm drop-shadow-md">
                    {currentStory.text}
                  </p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col justify-center items-center bg-black relative pointer-events-none">
                  <img
                    src={optimizeMediaUrl(currentStory.mediaUrl)}
                    alt="Status media"
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-contain bg-black transition-opacity duration-150"
                  />
                  {currentStory.text && (
                    <div className="absolute bottom-3 inset-x-3 p-3 bg-gray-950/80 backdrop-blur-md rounded-2xl text-white text-center text-xs font-semibold z-20 border border-gray-800/80">
                      {currentStory.text}
                    </div>
                  )}
                </div>
              )}

              {/* NAVIGATION TAP ZONES */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevStory();
                }} 
                className="absolute inset-y-0 left-0 w-1/3 z-30 cursor-pointer" 
              />
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextStory();
                }} 
                className="absolute inset-y-0 right-0 w-1/3 z-30 cursor-pointer" 
              />
            </div>

            {/* Bottom Reply Bar */}
            {selectedUserUid !== myUid && (
              <div 
                className="p-3 bg-gray-950 border-t border-gray-800 z-50 flex items-center gap-2"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-3.5 py-2 bg-gray-900 border border-gray-800 rounded-2xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setReplyText('')}
                  className="p-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 font-bold transition-all shadow-md cursor-pointer"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 select-none animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-3xl bg-gray-900 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-4 shadow-xl shadow-teal-500/5">
              <svg className="w-8 h-8 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-200 mb-1">
              Click on a contact to view their status update
            </h3>
            <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
              Status updates disappear after 6 to 48 hours. Tap (+) on My Status to share your own update.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
