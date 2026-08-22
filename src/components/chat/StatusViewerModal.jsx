import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function StatusViewerModal({ statuses = [], currentUser, onClose }) {
  // Sort helper function
  const sortChronologically = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
  };

  // Local reactive array to allow instant deletion updates
  const [activeList, setActiveList] = useState(() => sortChronologically(statuses));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const holdStartTimeRef = useRef(0);
  const progressIntervalRef = useRef(null);

  const STORY_DURATION = 8000; // 8 seconds per story segment
  const TICK_INTERVAL = 50;
  const PROGRESS_STEP = (TICK_INTERVAL / STORY_DURATION) * 100;

  // Keep activeList synced if parent statuses prop changes
  useEffect(() => {
    setActiveList(sortChronologically(statuses));
  }, [statuses]);

  const currentStatus = activeList[currentIndex];
  const isMyStatus = currentStatus?.userId === currentUser?.uid;

  useEffect(() => {
    if (!currentStatus?.id || !currentUser?.uid) return;
    if (currentStatus.userId === currentUser.uid) return;
    if (currentStatus.viewers?.includes(currentUser.uid)) return;

    const recordView = async () => {
      try {
        const statusDocRef = doc(db, 'statuses', currentStatus.id);
        await updateDoc(statusDocRef, {
          viewers: arrayUnion(currentUser.uid)
        });
        console.log("Recorded story view for", currentUser.uid);
      } catch (err) {
        console.error("Error recording story view:", err);
      }
    };
    recordView();
  }, [currentStatus?.id, currentUser?.uid]);

  // 1. PROGRESS BAR TIMER
  useEffect(() => {
    if (!currentStatus || isDeleting) return;

    if (!isPaused) {
      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            handleNext();
            return 0;
          }
          return prev + PROGRESS_STEP;
        });
      }, TICK_INTERVAL);
    } else {
      clearInterval(progressIntervalRef.current);
    }

    return () => clearInterval(progressIntervalRef.current);
  }, [currentIndex, isPaused, isDeleting, activeList.length, currentStatus]);

  const handleNext = () => {
    if (currentIndex < activeList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    } else {
      setProgress(0);
    }
  };

  // 2. DEDICATED MOBILE & DESKTOP EVENT HANDLERS
  const isTransitioningRef = useRef(false);

  const getEventClientX = (e) => {
    if (e.nativeEvent && e.nativeEvent.changedTouches && e.nativeEvent.changedTouches.length > 0) {
      return e.nativeEvent.changedTouches[0].clientX;
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return e.changedTouches[0].clientX;
    }
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return e.clientX;
  };

  // Pointer / Touch Down (Hold to Pause)
  const handleInteractionStart = (e) => {
    if (isDeleting) return;
    // Ignore clicks/touches on buttons (close, delete)
    if (e.target.closest('button')) return;

    holdStartTimeRef.current = Date.now();
    setIsPaused(true);
  };

  // Pointer / Touch End (Resume or Navigate)
  const handleInteractionEnd = (e) => {
    if (isDeleting) return;
    if (e.target.closest('button')) return;

    const holdDuration = Date.now() - holdStartTimeRef.current;
    setIsPaused(false);

    // If held for less than 220ms, it is a quick tap for navigation
    if (holdDuration < 220) {
      // Prevent multi-tap spamming / double firing on mobile
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      setTimeout(() => { isTransitioningRef.current = false; }, 250);

      const clientX = getEventClientX(e);
      if (clientX === undefined || clientX === null) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const containerWidth = rect.width;

      if (clickX < containerWidth * 0.30) {
        // Left 30% -> Previous Story
        handlePrev();
      } else {
        // Right 70% -> Next Story
        handleNext();
      }
    }
  };

  // 🔥 3. ZERO-LATENCY REAL-TIME DELETE HANDLER
  const handleDeleteStatus = async (e) => {
    e.stopPropagation();
    setIsPaused(true);

    if (!window.confirm("Delete this status permanently?")) {
      setIsPaused(false);
      return;
    }

    const targetId = currentStatus?.id;
    if (!targetId) return;

    setIsDeleting(true);

    // OPTIMISTIC LOCAL STATE UPDATE (Instant UI reaction)
    const updatedList = activeList.filter((s) => s.id !== targetId);

    if (updatedList.length === 0) {
      // No statuses remaining, close viewer immediately
      onClose();
    } else {
      // If deleting the last item in array, move to the preceding item
      if (currentIndex >= updatedList.length) {
        setCurrentIndex(updatedList.length - 1);
      }
      setActiveList(updatedList);
      setProgress(0);
      setIsDeleting(false);
      setIsPaused(false);
    }

    // BACKGROUND FIRESTORE DELETION
    try {
      await deleteDoc(doc(db, "statuses", targetId));
      console.log("Realtime deletion confirmed on Firestore:", targetId);
    } catch (err) {
      console.error("Firestore status delete error:", err);
      alert("Failed to sync deletion with database.");
    }
  };

  if (!currentStatus || activeList.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center select-none backdrop-blur-md">
      <div 
        className="relative w-full max-w-md h-[92vh] max-h-[850px] bg-gray-950 rounded-2xl overflow-hidden shadow-2xl border border-gray-800 flex flex-col justify-between select-none touch-manipulation"
        onPointerDown={handleInteractionStart}
        onPointerUp={handleInteractionEnd}
      >
        {/* Top Overlay */}
        <div className="absolute top-0 inset-x-0 z-30 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* Progress Bars for remaining statuses */}
          <div className="flex gap-1.5 w-full mb-3">
            {activeList.map((s, idx) => {
              let fill = 0;
              if (idx < currentIndex) fill = 100;
              else if (idx === currentIndex) fill = progress;
              return (
                <div key={s.id || idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-400 transition-all duration-75 ease-linear" 
                    style={{ width: `${fill}%` }} 
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src={currentStatus.userPhoto || '/default-avatar.png'} 
                alt="DP" 
                className={`w-10 h-10 rounded-full object-cover border-2 ${currentStatus.audience === 'close_friends' ? 'border-green-400' : 'border-teal-400'}`} 
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-white leading-tight">
                    {isMyStatus ? 'You' : currentStatus.userDisplayName}
                  </h4>
                  {currentStatus.audience === 'close_friends' && (
                    <span className="bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      ★ Close Friends
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-300">
                  {currentStatus.createdAt?.toDate ? new Date(currentStatus.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 z-[999] relative">
              {isMyStatus && (
                <button 
                  /* Use onPointerUp to handle the action *after* mouse-up, to prevent the parent's logic from firing */
                  onPointerUp={handleDeleteStatus}
                  
                  /* Also catch and stop mouse up if needed, just to be sure */
                  onMouseUp={(e) => e.stopPropagation()}
                  
                  /* Ensure single standard click is handled with immediate propagation stop */
                  onClick={(e) => e.stopPropagation()}
                  
                  disabled={isDeleting}
                  title="Delete Status"
                  className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-full transition-colors disabled:opacity-50 relative z-[1000] cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              <button 
                /* Close button must also stop propagation to prevent parent tap detection */
                onPointerUp={(e) => { e.stopPropagation(); onClose(); }}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="p-2 text-gray-300 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors relative z-[1000] cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center relative w-full h-full">
          {currentStatus.type === 'image' ? (
            <img 
              src={currentStatus.content} 
              alt="Story" 
              className="w-full h-full object-contain pointer-events-none" 
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center p-8 text-center" 
              style={{ background: currentStatus.bgColor || '#0f766e' }}
            >
              <p className="text-white text-2xl md:text-3xl font-extrabold break-words max-w-sm leading-relaxed drop-shadow-lg">
                {currentStatus.content}
              </p>
            </div>
          )}
        </div>

        {/* Caption */}
        {currentStatus.caption && (
          <div className="absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-center">
            <p className="text-white text-sm font-medium drop-shadow">{currentStatus.caption}</p>
          </div>
        )}
      </div>
    </div>
  );
}
