import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function StatusBar({ currentUser, onOpenViewer, onOpenUpload }) {
  const [statusGroups, setStatusGroups] = useState({});

  useEffect(() => {
    if (!currentUser?.uid) return;
    const now = new Date();
    const q = query(
      collection(db, "statuses"),
      where("expiresAt", ">", now)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groups = {};
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() };

        // AUDIENCE PRIVACY FILTER:
        // Show if: (1) Owned by currentUser, (2) Audience is 'all', OR (3) Current user is inside allowedUsers
        const isOwner = data.userId === currentUser.uid;
        const isPublic = !data.audience || data.audience === 'all';
        const isPermittedCloseFriend = data.audience === 'close_friends' && data.allowedUsers?.includes(currentUser.uid);

        if (isOwner || isPublic || isPermittedCloseFriend) {
          if (!groups[data.userId]) groups[data.userId] = [];
          groups[data.userId].push(data);
        }
      });
      setStatusGroups(groups);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const myStatuses = statusGroups[currentUser?.uid] || [];

  const hasUnviewedStories = (storiesList, currentUserId) => {
    return storiesList.some((story) => {
      if (story.viewerUids && story.viewerUids.includes(currentUserId)) return false;
      if (story.viewers && story.viewers.some((v) => (typeof v === 'string' ? v === currentUserId : v.uid === currentUserId))) return false;
      return true;
    });
  };

  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-800/60 overflow-x-auto no-scrollbar">
      {/* Current User Status & Add Button */}
      <button 
        onClick={() => myStatuses.length > 0 ? onOpenViewer(myStatuses) : onOpenUpload()}
        className="flex flex-col items-center flex-shrink-0 group relative cursor-pointer"
      >
        <div className={`relative w-12 h-12 rounded-full p-[2px] ${
          myStatuses.length > 0 
            ? myStatuses.some(s => s.audience === 'close_friends')
              ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-gray-950'
              : 'ring-2 ring-teal-400 ring-offset-2 ring-offset-gray-950'
            : 'border-2 border-dashed border-gray-600 group-hover:border-teal-400'
        } transition-all flex items-center justify-center`}>
          <img src={currentUser?.photoURL || '/default-avatar.png'} alt="My DP" className="w-full h-full rounded-full object-cover border border-gray-950" />
          <div 
            onClick={(e) => { e.stopPropagation(); onOpenUpload(); }}
            className="absolute -bottom-1 -right-1 bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black rounded-full w-4 h-4 flex items-center justify-center shadow"
          >
            +
          </div>
        </div>
        <span className="text-[11px] text-gray-400 mt-1 truncate max-w-[56px]">My Status</span>
      </button>

      {/* Friends Status Avatars */}
      {Object.entries(statusGroups).map(([userId, userStatuses]) => {
        if (userId === currentUser?.uid) return null;
        const first = userStatuses[0];
        const isCloseFriendsStory = userStatuses.some(s => s.audience === 'close_friends');
        const isUnviewed = hasUnviewedStories(userStatuses, currentUser?.uid);

        return (
          <button 
            key={userId}
            onClick={() => onOpenViewer(userStatuses)}
            className="flex flex-col items-center flex-shrink-0 group cursor-pointer"
          >
            <div className={`w-12 h-12 rounded-full p-[2px] transition-all flex items-center justify-center ${
              isUnviewed
                ? isCloseFriendsStory 
                  ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-gray-950 shadow-md shadow-green-500/20 scale-105' 
                  : 'ring-2 ring-teal-400 ring-offset-2 ring-offset-gray-950 shadow-md shadow-teal-500/20 scale-105'
                : 'ring-2 ring-gray-700 ring-offset-2 ring-offset-gray-950 opacity-80 group-hover:opacity-100'
            }`}>
              <img src={first.userPhoto || '/default-avatar.png'} alt="DP" className="w-full h-full rounded-full object-cover border border-gray-950" />
            </div>
            <span className="text-[11px] text-gray-300 mt-1 truncate max-w-[56px]">
              {first.userDisplayName?.split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
