import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, doc, setDoc, updateDoc, arrayUnion, increment, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore';
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
  const [liveStatuses, setLiveStatuses] = useState(statuses);
  const [usersMap, setUsersMap] = useState(usersDirectory);
  const [selectedUserUid, setSelectedUserUid] = useState(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isHoldPaused, setIsHoldPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySentSuccess, setReplySentSuccess] = useState(false);
  const [showViewersList, setShowViewersList] = useState(false);
  const timerRef = useRef(null);
  const viewedStoriesRef = useRef(new Set());

  const isPaused = isManualPaused || isHoldPaused || showViewersList;

  const myUid = currentUser?.uid;
  const myName = currentUser?.displayName || currentUser?.name || 'My Status';
  const myAvatar = currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${myUid || 'me'}`;

  // 1. REALTIME USERS DIRECTORY (FOR INSTANT GOOGLE NAME & AVATAR LOOKUP)
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {};
      snap.forEach((d) => {
        uMap[d.id] = { id: d.id, ...d.data() };
      });
      setUsersMap((prev) => ({ ...prev, ...uMap }));
    });
    return () => unsubUsers();
  }, []);

  // 2. REALTIME STATUSES WITH DYNAMIC 6h - 48h EXPIRY FILTER
  useEffect(() => {
    if (!isOpen) return;

    const unsubStatuses = onSnapshot(collection(db, 'statuses'), (snapshot) => {
      const now = Date.now();

      // Filter only stories that are still active based on their custom durationHours (6h to 48h)
      const activeRawStories = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((story) => {
          const durationHours = Number(story.durationHours) || 24;
          const durationMillis = durationHours * 60 * 60 * 1000;

          const createdTime = story.createdAt?.toMillis
            ? story.createdAt.toMillis()
            : new Date(story.createdAt || 0).getTime();

          const expiresAtTime = story.expiresAt?.toMillis
            ? story.expiresAt.toMillis()
            : (createdTime ? createdTime + durationMillis : 0);

          // Keep story if current time is before expiration
          return !createdTime || now < expiresAtTime;
        });

      setLiveStatuses(activeRawStories);
    }, (err) => {
      console.warn("Realtime status sync warning:", err);
    });

    return () => unsubStatuses();
  }, [isOpen]);

  // Sync prop statuses when modal opens or prop changes
  useEffect(() => {
    if (statuses && statuses.length > 0) {
      const now = Date.now();
      const valid = statuses.filter((st) => {
        const durationHours = Number(st.durationHours) || 24;
        const durationMillis = durationHours * 60 * 60 * 1000;

        const createdTime = st.createdAt?.toMillis
          ? st.createdAt.toMillis()
          : new Date(st.createdAt || 0).getTime();

        const expiresAtTime = st.expiresAt?.toMillis
          ? st.expiresAt.toMillis()
          : (createdTime ? createdTime + durationMillis : 0);

        return !createdTime || now < expiresAtTime;
      });
      setLiveStatuses(valid);
    }
  }, [statuses]);

  // Dynamic Viewer Identity Resolver (Real Google Profile Name & High-Res Avatar)
  const resolveViewerInfo = (viewer) => {
    const vUid = typeof viewer === 'string' ? viewer : (viewer.uid || viewer.id);
    const liveUserData = usersMap[vUid] || usersDirectory[vUid] || {};

    const resolvedName =
      liveUserData.displayName ||
      liveUserData.name ||
      (typeof viewer === 'object' ? viewer.name : null) ||
      liveUserData.email?.split('@')[0] ||
      'Friend';

    const resolvedAvatar =
      liveUserData.photoURL ||
      liveUserData.avatar ||
      (typeof viewer === 'object' ? viewer.avatar : null) ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${vUid || 'friend'}`;

    return { name: resolvedName, avatar: resolvedAvatar };
  };

  // Format Relative Time (e.g. 10:45 AM / Just now)
  const formatStoryTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Just now';
    }
  };

  // Remaining Lifetime Calculation (6h to 48h countdown)
  const getRemainingTimeText = (story) => {
    if (!story) return '';
    const now = Date.now();
    const durationHours = Number(story.durationHours) || 24;
    const durationMillis = durationHours * 60 * 60 * 1000;
    const createdTime = story.createdAt?.toMillis
      ? story.createdAt.toMillis()
      : new Date(story.createdAt || 0).getTime();

    const expiresAt = story.expiresAt?.toMillis
      ? story.expiresAt.toMillis()
      : (createdTime ? createdTime + durationMillis : 0);

    if (!expiresAt) return `${durationHours}h timer`;
    const diffMs = expiresAt - now;
    if (diffMs <= 0) return 'Expired';
    const hoursLeft = Math.ceil(diffMs / (1000 * 60 * 60));
    return `⏳ ${hoursLeft}h left (${durationHours}h)`;
  };

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 800);
  };

  // Group statuses by user dynamically
  const userMap = useMemo(() => {
    const map = {};
    (liveStatuses || []).forEach((st) => {
      const uid = st.userId || st.uid;
      if (!uid) return;
      const contactProfile = usersMap[uid] || usersDirectory[uid] || {};

      const resolvedName =
        (uid === myUid ? myName : null) ||
        contactProfile.displayName ||
        contactProfile.name ||
        (st.userName && st.userName !== 'Contact' && st.userName !== 'User' && st.userName !== 'Anonymous' ? st.userName : null) ||
        st.userDisplayName ||
        st.userEmail?.split('@')[0] ||
        contactProfile.email?.split('@')[0] ||
        'Friend';

      const resolvedAvatar =
        (uid === myUid ? myAvatar : null) ||
        contactProfile.photoURL ||
        contactProfile.avatar ||
        (st.userAvatar && !st.userAvatar.includes('seed=') ? st.userAvatar : null) ||
        st.userPhoto ||
        st.userAvatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

      if (!map[uid]) {
        map[uid] = {
          userId: uid,
          userName: resolvedName,
          userAvatar: resolvedAvatar,
          stories: [],
        };
      }
      map[uid].stories.push({
        id: st.id,
        type: st.type || (st.mediaUrl || st.imageUrl || st.content?.startsWith('http') ? 'image' : 'text'),
        text: st.text || st.caption || (st.type === 'text' ? st.content : '') || '',
        mediaUrl: st.mediaUrl || st.imageUrl || (st.type === 'image' ? st.content : '') || '',
        bgColor: st.bgColor || '#0f766e',
        createdAt: st.createdAt,
        viewers: st.viewers || [],
        viewerUids: st.viewerUids || [],
        viewCount: st.viewCount || (st.viewers?.length || 0),
      });
    });

    // Sort stories inside each group by createdAt
    Object.values(map).forEach((g) => {
      g.stories.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });
    });

    return map;
  }, [liveStatuses, myUid, myName, myAvatar, usersMap, usersDirectory]);

  const myStatusGroup = userMap[myUid] || null;
  const contactGroups = Object.values(userMap).filter((u) => u.userId !== myUid);

  const activeGroup = selectedUserUid ? userMap[selectedUserUid] : null;
  const activeStories = activeGroup?.stories || [];
  const baseCurrentStory = activeStories[currentStoryIndex] || null;
  const [activeStoryLive, setActiveStoryLive] = useState(null);
  const [subcollectionViews, setSubcollectionViews] = useState([]);

  // 3. TARGET STORY: DUAL-CHANNEL REALTIME SUBSCRIPTIONS (ROOT DOC + SUBCOLLECTION)
  useEffect(() => {
    if (!baseCurrentStory?.id) {
      setActiveStoryLive(null);
      setSubcollectionViews([]);
      return;
    }

    const storyId = baseCurrentStory.id;

    // A. Root Doc Listener
    const unsubDoc = onSnapshot(doc(db, 'statuses', storyId), (docSnap) => {
      if (docSnap.exists()) {
        const dData = docSnap.data();
        setActiveStoryLive({
          id: docSnap.id,
          ...dData,
          type: dData.type || (dData.mediaUrl || dData.imageUrl || dData.content?.startsWith('http') ? 'image' : 'text'),
          text: dData.text || dData.caption || (dData.type === 'text' ? dData.content : '') || '',
          mediaUrl: dData.mediaUrl || dData.imageUrl || (dData.type === 'image' ? dData.content : '') || '',
          bgColor: dData.bgColor || '#0f766e',
          viewers: dData.viewers || [],
          viewerUids: dData.viewerUids || [],
          viewCount: dData.viewCount || (dData.viewers?.length || 0),
        });
      }
    });

    // B. Realtime Subcollection Views Listener
    const unsubSubviews = onSnapshot(
      collection(db, 'statuses', storyId, 'views'),
      (snap) => {
        const viewsList = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        console.log(`[StoryView] 👁️ Live subcollection views for ${storyId}:`, viewsList);
        setSubcollectionViews(viewsList);
      },
      (err) => console.warn('[StoryView] Subcollection listener fallback notice:', err.message)
    );

    return () => {
      unsubDoc();
      unsubSubviews();
    };
  }, [baseCurrentStory?.id]);

  const currentStory = activeStoryLive?.id === baseCurrentStory?.id ? activeStoryLive : (baseCurrentStory || activeStoryLive);

  // Merge Unique Viewers from both Root Array and Subcollection
  const mergedViewers = useMemo(() => {
    const map = new Map();

    // 1. From root doc
    if (currentStory?.viewers && Array.isArray(currentStory.viewers)) {
      currentStory.viewers.forEach((v) => {
        if (v && (v.uid || v.id)) map.set(v.uid || v.id, v);
      });
    }

    // 2. From subcollection
    subcollectionViews.forEach((v) => {
      if (v && v.uid) {
        map.set(v.uid, { ...map.get(v.uid), ...v });
      }
    });

    return Array.from(map.values());
  }, [currentStory?.viewers, subcollectionViews]);

  const totalViewCount = Math.max(mergedViewers.length, currentStory?.viewCount || 0);

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

  // 1. GUARANTEED STORY VIEW REGISTRATION (TRIGGERS AS SOON AS STORY OPENS)
  useEffect(() => {
    if (!isOpen || !currentStory?.id || selectedUserUid === myUid || !myUid) return;

    const storyId = currentStory.id;
    // Prevent duplicate triggers within the same session
    if (viewedStoriesRef.current.has(storyId)) return;

    const alreadyInDb = currentStory.viewerUids?.includes(myUid) || currentStory.viewers?.some((v) => (typeof v === 'string' ? v === myUid : v.uid === myUid));
    if (alreadyInDb) {
      viewedStoriesRef.current.add(storyId);
      return;
    }

    viewedStoriesRef.current.add(storyId);

    // Write to Firestore immediately using setDoc with merge: true + dual-channel subcollection write
    const recordView = async () => {
      try {
        console.log('[StoryView] Recording view for story ID:', storyId, 'by UID:', myUid);

        const storyRef = doc(db, 'statuses', storyId);
        const myProfile = usersMap[myUid] || usersDirectory[myUid] || {};
        const viewerData = {
          uid: myUid,
          name: myProfile.displayName || currentUser?.displayName || currentUser?.name || 'User',
          avatar: myProfile.photoURL || currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${myUid}`,
          viewedAt: new Date().toISOString(),
        };

        // 1. Atomic array union update on story doc
        await setDoc(
          storyRef,
          {
            viewerUids: arrayUnion(myUid),
            viewers: arrayUnion(viewerData),
            viewCount: increment(1),
          },
          { merge: true }
        );

        // 2. Dual fallback write to subcollection
        const subViewRef = doc(db, 'statuses', storyId, 'views', myUid);
        await setDoc(subViewRef, viewerData, { merge: true });

        console.log('[StoryView] ✅ View recorded successfully in Firestore!');
      } catch (err) {
        console.error('[StoryView] Error recording story view:', err);
      }
    };

    recordView();
  }, [isOpen, currentStory?.id, selectedUserUid, myUid, currentUser, usersMap, usersDirectory]);

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
    setShowViewersList(false);
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
    setShowViewersList(false);
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
    }
  };

  // 6. INSTANT OPTIMISTIC STORY DELETION HANDLER
  const handleDeleteStatus = async (storyId) => {
    if (!storyId || !myUid) return;
    if (timerRef.current) clearInterval(timerRef.current);

    // Optimistically calculate remaining stories
    const updatedStories = activeStories.filter((s) => s.id !== storyId);

    if (updatedStories.length === 0) {
      // No stories remaining for this user -> close story viewer
      setSelectedUserUid(null);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else if (currentStoryIndex >= updatedStories.length) {
      // Move to the last available story
      setCurrentStoryIndex(updatedStories.length - 1);
      setProgress(0);
    } else {
      setProgress(0);
    }

    try {
      await deleteDoc(doc(db, 'statuses', storyId));
    } catch (err) {
      console.error('Delete status error:', err);
    }
  };

  const handleOpenUserStory = (uid) => {
    setProgress(0);
    setSelectedUserUid(uid);
    setCurrentStoryIndex(0);
  };

  // Function to find or create direct chat and send story reply
  const handleSendStatusReply = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeGroup?.userId || !myUid || replySending || !currentStory) return;

    const targetUid = activeGroup.userId;
    const currentMsgText = replyText.trim();
    setReplySending(true);

    try {
      // 1. Find existing 1-on-1 chat
      let targetChatId = null;
      const chatsRef = collection(db, 'chats');
      const q1 = query(chatsRef, where('participants', 'array-contains', myUid));
      const snap1 = await getDocs(q1);

      snap1.forEach((d) => {
        const data = d.data();
        if (!data.isGroup && data.participants?.includes(targetUid)) {
          targetChatId = d.id;
        }
      });

      // If chat does not exist, create a new 1-on-1 chat
      if (!targetChatId) {
        const newChatRef = doc(collection(db, 'chats'));
        targetChatId = newChatRef.id;
        await setDoc(newChatRef, {
          id: targetChatId,
          isGroup: false,
          participants: [myUid, targetUid],
          createdAt: serverTimestamp(),
          participantsData: {
            [myUid]: {
              displayName: currentUser?.displayName || currentUser?.name || 'User',
              photoURL: currentUser?.photoURL || '',
              email: currentUser?.email || '',
            },
            [targetUid]: {
              displayName: activeGroup.userName || 'Contact',
              photoURL: activeGroup.userAvatar || '',
            },
          },
        });
      }

      // 2. Add Story Reply Message
      const messagePayload = {
        text: currentMsgText,
        isStoryReply: true,
        storyReplyData: {
          storyId: currentStory.id || '',
          mediaUrl: currentStory.mediaUrl || '',
          text: currentStory.text || '',
          bgColor: currentStory.bgColor || '#0f766e',
          type: currentStory.type || (currentStory.mediaUrl ? 'image' : 'text'),
          ownerName: activeGroup?.userName || 'Contact',
          ownerAvatar: activeGroup?.userAvatar || '',
        },
        senderId: myUid,
        senderName: currentUser?.displayName || currentUser?.name || 'User',
        senderAvatar: currentUser?.photoURL || '',
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        timestampMillis: Date.now()
      };

      await addDoc(collection(db, 'chats', targetChatId, 'messages'), messagePayload);

      // 3. Atomically update parent chat doc
      const chatDocRef = doc(db, 'chats', targetChatId);
      const parentUpdate = {
        lastMessage: `Replied to status: "${currentMsgText}"`,
        lastMessageSenderId: myUid,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`unreadCounts.${targetUid}`]: increment(1),
        [`unread_${targetUid}`]: increment(1),
      };

      await updateDoc(chatDocRef, parentUpdate).catch(async () => {
        await setDoc(chatDocRef, parentUpdate, { merge: true });
      });

      // 4. Success UI Feedback
      setReplyText('');
      setReplySentSuccess(true);
      setTimeout(() => setReplySentSuccess(false), 2500);

    } catch (error) {
      console.error('Error sending story reply:', error);
    } finally {
      setReplySending(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      const tag = e.target.tagName?.toUpperCase();
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;
      if (isInput) return; // Allow spacebar & full typing freedom inside text inputs

      if (e.key === 'Escape') {
        if (selectedUserUid) setSelectedUserUid(null);
        else handleAnimatedClose();
      } else if (e.key === 'ArrowRight') {
        handleNextStory();
      } else if (e.key === 'ArrowLeft') {
        handlePrevStory();
      } else if (e.code === 'Space' || e.key === ' ') {
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
                  src={activeGroup?.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border-2 border-teal-400 shadow-md"
                />
                <div>
                  <h4 className="text-xs font-black truncate max-w-[140px]">
                    {selectedUserUid === myUid ? 'Your Story' : activeGroup?.userName}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-teal-300 font-bold">
                    <span>{currentStoryIndex + 1} of {activeStories.length}</span>
                    <span className="text-gray-400 font-normal">•</span>
                    <span className="text-gray-400 font-medium">{formatStoryTime(currentStory?.createdAt)}</span>
                    <span className="text-gray-400 font-normal">•</span>
                    <span className="text-teal-400 font-semibold">{getRemainingTimeText(currentStory)}</span>
                  </div>
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

            {/* Bottom Actions: Owner Views Bar OR Contact Reply Bar */}
            {selectedUserUid === myUid ? (
              <div 
                className="p-3.5 bg-gray-950/90 border-t border-gray-800 z-50 flex items-center justify-center cursor-pointer hover:bg-gray-900 transition-colors"
                onClick={() => setShowViewersList((prev) => !prev)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 text-teal-400 text-xs font-black tracking-wide">
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{totalViewCount} {totalViewCount === 1 ? 'view' : 'views'}</span>
                  <svg className={`w-3.5 h-3.5 stroke-[2.5] transition-transform ${showViewersList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </div>
              </div>
            ) : (
              <form 
                onSubmit={handleSendStatusReply}
                className="p-3 bg-gray-950 border-t border-gray-800 z-50 flex items-center gap-2 relative"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {/* Success Toast */}
                {replySentSuccess && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-teal-500 text-gray-950 text-[11px] font-black px-3 py-1 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 whitespace-nowrap">
                    Reply sent to {activeGroup?.userName} ✓
                  </div>
                )}

                <input
                  type="text"
                  placeholder={`Reply to ${activeGroup?.userName || 'status'}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-2xl text-xs text-white placeholder-gray-500 outline-none focus:border-teal-500 transition-colors"
                />

                <button
                  type="submit"
                  disabled={!replyText.trim() || replySending}
                  className={`p-2 rounded-xl font-bold transition-all shadow-md ${
                    replyText.trim() && !replySending
                      ? 'bg-teal-500 hover:bg-teal-400 text-gray-950 shadow-teal-500/20 cursor-pointer active:scale-95'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                  title="Send Reply"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            )}

            {/* OWNER VIEWER DRAWER SHEET */}
            {selectedUserUid === myUid && showViewersList && (
              <div 
                className="absolute inset-x-0 bottom-0 max-h-[55%] bg-gray-950/95 border-t border-gray-800 rounded-t-3xl z-50 p-4 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                  <h5 className="text-xs font-black text-white flex items-center gap-2">
                    <span>Viewed by</span>
                    <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-[10px]">
                      {totalViewCount}
                    </span>
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowViewersList(false)}
                    className="text-gray-400 hover:text-white text-xs font-bold p-1 cursor-pointer"
                  >
                    Done
                  </button>
                </div>

                {/* Viewers List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-900/60 py-2 space-y-1">
                  {mergedViewers.length > 0 ? (
                    mergedViewers.map((viewer, vIdx) => {
                      const { name: resolvedName, avatar: resolvedAvatar } = resolveViewerInfo(viewer);
                      const viewedAtStr = typeof viewer === 'object' && viewer.viewedAt
                        ? new Date(viewer.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Viewed';

                      return (
                        <div key={vIdx} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={resolvedAvatar}
                              alt={resolvedName}
                              className="w-8 h-8 rounded-full object-cover border border-gray-800"
                            />
                            <span className="text-xs font-bold text-white truncate max-w-[170px]">{resolvedName}</span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-medium shrink-0">
                            {viewedAtStr}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-gray-500 font-semibold">
                      No views yet
                    </div>
                  )}
                </div>
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
