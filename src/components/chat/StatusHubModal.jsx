import React, { useState, useEffect, useRef } from 'react';

export default function StatusHubModal({ isOpen, onClose, currentUser, statusList = [], onUploadStatus }) {
  const [isClosing, setIsClosing] = useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const progressIntervalRef = useRef(null);

  const myName = currentUser?.displayName || currentUser?.name || 'My Account';
  const myAvatar = currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser?.uid || 'me'}`;

  // 1. UNIVERSAL STATUS NORMALIZER (Handles all field variations: text/content/caption & mediaUrl/imageUrl/url)
  const normalizedStatuses = (statusList || []).map((st) => {
    const textVal = st.text || st.content || st.caption || '';
    const mediaVal = st.mediaUrl || st.imageUrl || st.url || st.image || '';
    const typeVal = st.type || (mediaVal ? 'image' : 'text');
    return {
      ...st,
      text: textVal,
      mediaUrl: mediaVal,
      type: typeVal,
      bgColor: st.bgColor || 'linear-gradient(135deg,#0d9488 0%, #064e3b 100%)',
      timestamp: st.createdAt ? 'Recently' : 'Just now',
    };
  });

  // Group by User ID
  const groupedMap = {};
  normalizedStatuses.forEach((st) => {
    if (!groupedMap[st.userId]) {
      groupedMap[st.userId] = {
        userId: st.userId,
        userName: st.userName || (st.userId === currentUser?.uid ? myName : 'User'),
        userAvatar: st.userAvatar || (st.userId === currentUser?.uid ? myAvatar : `https://api.dicebear.com/7.x/bottts/svg?seed=${st.userId}`),
        stories: [],
      };
    }
    groupedMap[st.userId].stories.push(st);
  });

  const groupedUsers = Object.values(groupedMap);
  const myStatusGroup = groupedUsers.find((u) => u.userId === currentUser?.uid) || null;
  const otherStatusGroups = groupedUsers.filter((u) => u.userId !== currentUser?.uid);

  const allGroups = myStatusGroup ? [myStatusGroup, ...otherStatusGroups] : otherStatusGroups;
  const currentGroup = allGroups[selectedUserIndex] || null;
  const activeStories = currentGroup?.stories || [];
  const currentStory = activeStories[currentStoryIndex] || null;

  // 5-Second Progress Timer
  useEffect(() => {
    if (!isOpen || isClosing || !currentStory || isPaused) return;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(progressIntervalRef.current);
  }, [isOpen, isClosing, selectedUserIndex, currentStoryIndex, isPaused, activeStories.length]);

  const handleNextStory = () => {
    setProgress(0);
    if (currentStoryIndex < activeStories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
    } else if (selectedUserIndex < allGroups.length - 1) {
      setSelectedUserIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
    } else {
      handleAnimatedClose();
    }
  };

  const handlePrevStory = () => {
    setProgress(0);
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
    } else if (selectedUserIndex > 0) {
      setSelectedUserIndex((prev) => prev - 1);
      setCurrentStoryIndex(0);
    }
  };

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 850);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleAnimatedClose();
      if (e.key === 'ArrowRight') handleNextStory();
      if (e.key === 'ArrowLeft') handlePrevStory();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing, selectedUserIndex, currentStoryIndex, activeStories.length]);

  if (!isOpen && !isClosing) return null;

  // Determine if current story is text or media
  const hasMedia = Boolean(currentStory?.mediaUrl);
  const isTextOnly = !hasMedia && Boolean(currentStory?.text);

  return (
    <div
      className={`fixed inset-0 z-[200] bg-gray-950 flex flex-col md:flex-row overflow-hidden select-none ${
        isClosing ? 'animate-status-collapse' : 'animate-status-expand'
      }`}
    >
      {/* 1. LEFT SIDEBAR FEED */}
      <div
        className={`w-full md:w-80 lg:w-96 h-full border-r border-gray-800/80 flex flex-col bg-gray-950/95 z-30 shrink-0 ${
          isClosing ? 'animate-status-content-out' : 'animate-status-content-in'
        }`}
      >
        <div className="p-4 border-b border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-black">
              ⚡
            </div>
            <h2 className="text-base font-bold text-white tracking-wide">Status Updates</h2>
          </div>
          <button
            type="button"
            onClick={handleAnimatedClose}
            className="p-2 rounded-full bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* MY STATUS CARD */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-2 block mb-2">
              My Status
            </span>
            <div
              onClick={() => {
                if (myStatusGroup) {
                  setSelectedUserIndex(0);
                  setCurrentStoryIndex(0);
                  setProgress(0);
                }
              }}
              className={`flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer ${
                selectedUserIndex === 0 && myStatusGroup
                  ? 'bg-teal-500/10 border border-teal-500/40'
                  : 'bg-gray-900/60 hover:bg-gray-900 border border-gray-800/80'
              }`}
            >
              <div className="relative shrink-0">
                <img
                  src={myAvatar}
                  alt={myName}
                  className={`w-12 h-12 rounded-full object-cover p-0.5 ${
                    myStatusGroup ? 'border-2 border-teal-400' : 'border border-gray-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onUploadStatus) onUploadStatus();
                  }}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-teal-500 hover:bg-teal-400 text-gray-950 flex items-center justify-center font-black shadow-md cursor-pointer"
                  title="Add status"
                >
                  +
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white truncate">{myName}</h4>
                <p className="text-[11px] text-gray-400 truncate">
                  {myStatusGroup ? `${myStatusGroup.stories.length} active updates` : 'Tap (+) to add status'}
                </p>
              </div>
            </div>
          </div>

          {/* RECENT UPDATES */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-2 block mb-2">
              Recent Updates ({otherStatusGroups.length})
            </span>

            {otherStatusGroups.length > 0 ? (
              <div className="space-y-1.5">
                {otherStatusGroups.map((contact, idx) => {
                  const targetIdx = myStatusGroup ? idx + 1 : idx;
                  const isSelected = selectedUserIndex === targetIdx;

                  return (
                    <div
                      key={contact.userId || idx}
                      onClick={() => {
                        setSelectedUserIndex(targetIdx);
                        setCurrentStoryIndex(0);
                        setProgress(0);
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/10 border border-teal-500/30'
                          : 'hover:bg-gray-900/60 border border-transparent'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-teal-400 to-emerald-400 flex items-center justify-center shrink-0">
                        <img
                          src={contact.userAvatar}
                          alt={contact.userName}
                          className="w-full h-full rounded-full object-cover border-2 border-gray-950"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-gray-200 truncate">{contact.userName}</h4>
                        <p className="text-[10px] text-gray-400 truncate">Recent updates</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-500 text-xs">No updates from contacts yet</div>
            )}
          </div>
        </div>
      </div>

      {/* 2. RIGHT CENTER: IMMERSIVE STORY CANVAS */}
      <div
        className={`flex-1 h-full relative flex items-center justify-center bg-black/95 overflow-hidden ${
          isClosing ? 'animate-status-content-out' : 'animate-status-content-in'
        }`}
      >
        {currentStory ? (
          <div
            className="w-full max-w-lg h-full max-h-[92vh] flex flex-col relative rounded-3xl overflow-hidden shadow-2xl border border-gray-800/80 bg-gray-950"
            onMouseDown={() => setIsPaused(true)}
            onMouseUp={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
          >
            {/* PROGRESS BARS */}
            <div className="absolute top-3 inset-x-3 z-40 flex items-center gap-1.5">
              {activeStories.map((_, idx) => (
                <div key={idx} className="flex-1 h-1 bg-white/25 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-400 transition-all duration-100 ease-linear"
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

            {/* HEADER */}
            <div className="absolute top-6 inset-x-3 z-40 flex items-center justify-between p-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent rounded-t-2xl">
              <div className="flex items-center gap-3">
                <img
                  src={currentGroup?.userAvatar || myAvatar}
                  alt="avatar"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-400 shadow-md"
                />
                <div>
                  <h4 className="text-sm font-bold text-white drop-shadow">
                    {currentGroup?.userName || myName}
                  </h4>
                  <span className="text-[10px] text-gray-300 drop-shadow opacity-90">
                    {currentStory?.timestamp}
                  </span>
                </div>
              </div>
            </div>

            {/* RENDER MEDIA OR TEXT */}
            <div className="flex-1 relative flex items-center justify-center bg-gray-950 overflow-hidden">
              {isTextOnly ? (
                <div
                  className="w-full h-full flex items-center justify-center p-8 text-center"
                  style={{ background: currentStory.bgColor || '#0f766e' }}
                >
                  <p className="text-2xl sm:text-3xl font-extrabold text-white leading-relaxed max-w-md drop-shadow-md break-words">
                    {currentStory.text}
                  </p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col justify-center items-center bg-black relative">
                  <img
                    src={currentStory.mediaUrl}
                    alt="Status media"
                    className="w-full h-full object-contain bg-black"
                  />
                  {currentStory.text && (
                    <div className="absolute bottom-4 inset-x-4 p-3 bg-black/70 backdrop-blur-md rounded-2xl text-white text-center text-xs font-semibold z-30">
                      {currentStory.text}
                    </div>
                  )}
                </div>
              )}

              {/* NAVIGATION CLICK ZONES */}
              <div onClick={handlePrevStory} className="absolute inset-y-0 left-0 w-1/3 z-30 cursor-pointer" />
              <div onClick={handleNextStory} className="absolute inset-y-0 right-0 w-1/3 z-30 cursor-pointer" />
            </div>

            {/* REPLY BOX */}
            {currentGroup?.userId !== currentUser?.uid && (
              <div className="p-3 bg-gray-950/95 border-t border-gray-800 z-40 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Reply to status..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-2xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setReplyText('')}
                  className="p-2.5 rounded-xl bg-teal-500 text-gray-950 font-bold hover:bg-teal-400 transition-all shadow-md"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500 gap-2">
            <p className="text-sm font-semibold">Select a status on the left to view</p>
          </div>
        )}
      </div>
    </div>
  );
}
