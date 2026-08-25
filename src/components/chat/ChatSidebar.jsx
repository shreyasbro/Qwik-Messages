import React, { useState, useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { useRecipient } from '../../hooks/useRecipient';
import { safeString } from '../../utils/safeRender';
import UserSearchModal from './UserSearchModal';
import ProfileEditorModal from '../profile/ProfileEditorModal';
import PresenceBadge from '../profile/PresenceBadge';
import SupportFAQ from './SupportFAQ';
import CreateGroupModal from './CreateGroupModal';
import StatusBar from './StatusBar';
import StatusUploadModal from './StatusUploadModal';
import StatusViewerModal from './StatusViewerModal';
import WhatsAppStatusModal from './WhatsAppStatusModal';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// 1. KEYWORD HIGHLIGHTER HELPER
export const HighlightText = ({ text = '', highlight = '' }) => {
  if (!highlight.trim() || !text) return <span>{text}</span>;
  
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="text-teal-400 font-extrabold underline decoration-teal-500/50 bg-teal-500/10 px-0.5 rounded">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

// 2. COMPREHENSIVE PARTICIPANT & CHAT TITLE RESOLVER
export const resolveChatDetails = (chat, currentUid, usersList = []) => {
  if (!chat) return { title: 'Unknown', email: '', username: '', isGroup: false, avatar: '' };

  // Case A: Group Chat
  if (chat.isGroup || chat.type === 'group') {
    const grpTitle = chat.groupName || chat.name || 'Group Chat';
    const groupDesc = chat.groupDescription || chat.description || '';
    return {
      title: grpTitle,
      email: '',
      username: groupDesc,
      groupDescription: groupDesc,
      avatar: chat.groupAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(grpTitle)}&background=0d9488&color=fff&bold=true`,
      isGroup: true,
    };
  }

  // Case B: Direct Chat - Find the other user's UID
  let otherUid = null;
  if (Array.isArray(chat.participants)) {
    otherUid = chat.participants.find((uid) => uid !== currentUid);
  } else if (chat.participantIds) {
    otherUid = chat.participantIds.find((uid) => uid !== currentUid);
  }

  // Check global users directory / allUsers list
  if (otherUid && Array.isArray(usersList) && usersList.length > 0) {
    const foundUser = usersList.find((u) => (u.uid || u.id) === otherUid);
    if (foundUser) {
      const emailName = foundUser.email ? foundUser.email.split('@')[0] : 'User';
      const displayName = foundUser.displayName || foundUser.name || emailName;
      const username = foundUser.userName || foundUser.username || emailName || '';
      const avatar = userService.resolveAvatar({
        customAvatarUrl: foundUser.customAvatarUrl,
        photoURL: foundUser.photoURL,
        avatar: foundUser.avatar,
        displayName
      });
      return {
        title: displayName,
        email: foundUser.email || '',
        username,
        avatar,
        isGroup: false,
      };
    }
  }

  // Check participantsData embedded map
  if (chat.participantsData) {
    const targetUid = otherUid || Object.keys(chat.participantsData).find((uid) => uid !== currentUid);
    if (targetUid && chat.participantsData[targetUid]) {
      const data = chat.participantsData[targetUid];
      const emailName = data.email ? data.email.split('@')[0] : 'User';
      const displayName = data.displayName || data.name || emailName;
      const username = data.userName || data.username || emailName || '';
      const avatar = userService.resolveAvatar({
        customAvatarUrl: data.customAvatarUrl,
        photoURL: data.photoURL,
        avatar: data.avatar,
        displayName
      });
      return {
        title: displayName,
        email: data.email || '',
        username,
        avatar,
        isGroup: false,
      };
    }
  }

  // Check direct recipient / user object if attached
  const otherObj = chat.recipient || chat.otherUser || chat.user;
  if (otherObj) {
    const emailName = otherObj.email ? otherObj.email.split('@')[0] : 'User';
    const displayName = otherObj.displayName || otherObj.name || emailName;
    const username = otherObj.userName || otherObj.username || emailName || '';
    const avatar = userService.resolveAvatar({
      customAvatarUrl: otherObj.customAvatarUrl,
      photoURL: otherObj.photoURL,
      avatar: otherObj.avatar,
      displayName
    });
    return {
      title: displayName,
      email: otherObj.email || '',
      username,
      avatar,
      isGroup: false,
    };
  }

  // Generic fallback using chat title or email
  const rawTitle = chat.displayName || chat.name || chat.otherUserName;
  const fallbackTitle = rawTitle && rawTitle !== 'Direct Message' ? rawTitle : (chat.email ? chat.email.split('@')[0] : 'User');
  const fallbackEmail = chat.email || '';
  const fallbackUsername = chat.userName || chat.username || (fallbackEmail ? fallbackEmail.split('@')[0] : '');
  const avatar = userService.resolveAvatar({
    photoURL: chat.photoURL,
    displayName: fallbackTitle
  });

  return {
    title: fallbackTitle,
    email: fallbackEmail,
    username: fallbackUsername,
    avatar,
    isGroup: false,
  };
};

export const getChatDisplayInfo = resolveChatDetails;

function ChatListItem({ chat, currentUser, activeChat, setActiveChat, setPreviewImage }) {
  const isGroup = chat.isGroup || chat.type === 'group';
  const { recipient } = useRecipient(isGroup ? [] : chat.participants, currentUser?.uid);
  
  const chatName = isGroup ? chat.groupName : (recipient?.displayName || 'Loading...');
  const avatarSrc = isGroup 
    ? (chat.groupAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&background=0d9488&color=fff&bold=true`) 
    : (recipient?.photoURL || userService.resolveAvatar({ displayName: chatName }));
    
  const activeTargetId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
  const currentChatId = chat.id || chat.chatId || chat.roomId;
  const isActive = Boolean(activeTargetId && currentChatId && activeTargetId === currentChatId);

  // Real-time typing status calculation from Firestore chat document (1-second fast sync)
  const isTyping = Boolean(
    chat?.typingUsers && 
    Object.entries(chat.typingUsers).some(([uid, val]) => {
      if (uid === currentUser?.uid || !val) return false;
      if (val === true) return true;
      const numVal = Number(val);
      return !isNaN(numVal) && numVal > 0 && (Date.now() - numVal) <= 1200;
    })
  );

  const formatTimeSafe = (timestamp) => {
    if (!timestamp) return '';
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div
      onClick={() => {
        if (isGroup) {
          setActiveChat({
            id: chat.id || chat.chatId,
            chatId: chat.id || chat.chatId,
            groupName: chatName,
            groupAvatar: chat.groupAvatar || null,
            groupDescription: chat.groupDescription || '',
            admins: chat.admins || [chat.createdBy],
            onlyAdminsCanMessage: chat.onlyAdminsCanMessage || false,
            participants: chat.participants,
            createdBy: chat.createdBy,
            isGroup: true,
            type: 'group'
          });
          return;
        }
        if (!recipient) return;
        setActiveChat({
          id: chat.id || chat.chatId,
          chatId: chat.id || chat.chatId,
          recipient: recipient,
          participants: chat.participants
        });
      }}
      className={`flex items-center gap-4 p-3.5 mx-2 mb-1.5 rounded-2xl cursor-pointer transition-all duration-300 ease-in-out border ${
        isActive 
          ? 'bg-teal-500/10 border-teal-500/40 shadow-lg shadow-black/25' 
          : 'bg-transparent border-transparent hover:bg-slate-800/40 hover:border-slate-700/50'
      }`}
    >
      <div className="relative shrink-0 select-none">
        <img 
          src={avatarSrc} 
          alt={safeString(chatName)} 
          title="View profile picture"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewImage(avatarSrc);
          }}
          className="w-11 h-11 rounded-2xl object-cover border border-slate-700/60 cursor-pointer hover:brightness-90 transition-all active:scale-95" 
        />
        {isTyping ? (
          <span 
            className="absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-950 rounded-full bg-teal-400 flex items-center justify-center shadow-[0_0_10px_rgba(45,212,191,0.7)] animate-pulse z-10"
          />
        ) : !isGroup ? (
          <PresenceBadge status={recipient?.presenceStatus || (recipient?.isOnline ? 'online' : 'idle')} className="absolute bottom-0.5 right-0.5 z-10" size="w-2.5 h-2.5" />
        ) : null}
      </div>
      <div className="flex-grow min-w-0 text-left">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-[13px] font-bold text-slate-200 tracking-wide truncate">{safeString(chatName)}</h3>
          {chat.lastMessageTime && (
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              {formatTimeSafe(chat.lastMessageTime)}
            </span>
          )}
        </div>
        <div className={`text-[11px] truncate max-w-[180px] font-medium ${isTyping ? "text-teal-400 font-bold animate-pulse flex items-center gap-1" : "text-slate-400"}`}>
          {isTyping ? "✍️ typing..." : safeString(chat.lastMessage || 'Say hi to your new friend! 👋')}
        </div>
      </div>
    </div>
  );
}

function ContactSelectorItem({ chat, currentUser, activeSpecificModal, specificContacts, setSpecificContacts }) {
  const { recipient } = useRecipient(chat.participants, currentUser?.uid);
  const friendId = recipient?.uid || recipient?.id || chat.chatId;
  const friendName = recipient?.displayName || 'Loading...';
  const avatarSrc = recipient?.photoURL || userService.resolveAvatar({ displayName: friendName });
  const isSelected = specificContacts[activeSpecificModal]?.includes(friendId);
  const statusDisplay = recipient?.status || (recipient?.isOnline ? "🟢 Online" : "⚪ Offline") || "Direct Secure Connection";

  return (
    <div 
      onClick={() => {
        setSpecificContacts((prev) => {
          const currentList = prev[activeSpecificModal] || [];
          const updated = isSelected 
            ? currentList.filter(id => id !== friendId)
            : [...currentList, friendId];
          return { ...prev, [activeSpecificModal]: updated };
        });
      }}
      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
        isSelected ? "bg-teal-500/10 border-teal-500/50" : "bg-slate-950/40 border-slate-800/60 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <img src={avatarSrc} alt={friendName} className="w-8 h-8 rounded-full border border-slate-700 object-cover shrink-0" />
        <div className="truncate text-left">
          <p className="text-xs font-bold text-white truncate">{friendName}</p>
          <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{statusDisplay}</p>
        </div>
      </div>
      
      {/* Checkbox Indicator */}
      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
        isSelected ? "bg-teal-500 border-teal-400 text-slate-950 font-black text-xs" : "border-slate-600 bg-slate-900"
      }`}>
        {isSelected && "✓"}
      </div>
    </div>
  );
}

export default function ChatSidebar() {
  const { chats, activeChat, setActiveChat, chatsLoading, setPreviewImage } = useChat();
  const { currentUser, userProfile } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGroupCreateOpen, setIsGroupCreateOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState("main"); // 'main' | 'privacy'
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isStatusViewerOpen, setIsStatusViewerOpen] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [allUsersList, setAllUsersList] = useState([]);

  // Real-time directory of all registered users (for instant 1-on-1 name & Google avatar resolution)
  React.useEffect(() => {
    if (!currentUser?.uid) return;
    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const uList = [];
      snapshot.forEach((docSnap) => {
        uList.push({ uid: docSnap.id, id: docSnap.id, ...docSnap.data() });
      });
      setAllUsersList(uList);
    }, (err) => {
      console.error("Error subscribing to users directory:", err);
    });

    return () => unsubUsers();
  }, [currentUser?.uid]);

  // Real-time status query
  React.useEffect(() => {
    if (!currentUser?.uid) return;
    const now = new Date();
    const q = query(
      collection(db, "statuses"),
      where("expiresAt", ">", now)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() };
        const isOwner = data.userId === currentUser.uid;
        const isPublic = !data.audience || data.audience === 'all';
        const isPermittedCloseFriend = data.audience === 'close_friends' && data.allowedUsers?.includes(currentUser.uid);

        if (isOwner || isPublic || isPermittedCloseFriend) {
          list.push(data);
        }
      });
      setStatuses(list);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const handleStatusButtonClick = () => {
    setIsStatusViewerOpen(true);
  };

  const [comingSoonFeature, setComingSoonFeature] = useState(null);
  const addMenuRef = React.useRef(null);

  const triggerComingSoon = (featureTitle) => {
    setComingSoonFeature(featureTitle);
    setTimeout(() => {
      setComingSoonFeature(null);
    }, 2800);
  };

  React.useEffect(() => {
    const handleOutsideClick = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  const [privacySettings, setPrivacySettings] = useState({
    lastSeen: "everyone",     // 'everyone' | 'contacts' | 'nobody' | 'specific'
    profilePhoto: "contacts", // 'everyone' | 'contacts' | 'nobody' | 'specific'
    readReceipts: "everyone", // 'everyone' | 'contacts' | 'nobody' | 'specific'
  });

  // Store selected specific user IDs for each setting
  const [specificContacts, setSpecificContacts] = useState({
    lastSeen: [],
    profilePhoto: [],
    readReceipts: [],
  });

  // State to control which setting is currently open in the Contact Selector Modal
  const [activeSpecificModal, setActiveSpecificModal] = useState(null); // 'lastSeen' | 'profilePhoto' | 'readReceipts' | null

  const handlePrivacyChange = (key, value) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: value }));
    console.log(`🔒 Updated ${key} to:`, value);
    if (value === "specific") {
      setActiveSpecificModal(key);
    }
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    setSettingsView("main");
  };
 
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'groups'
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterRef = React.useRef(null);

  // Close filter popover on outside click
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract known users map from active chats / users list for accurate profile resolution
  const usersDirectory = useMemo(() => {
    const map = {};
    if (Array.isArray(chats)) {
      chats.forEach((c) => {
        if (c.participantsData) {
          Object.entries(c.participantsData).forEach(([uid, data]) => {
            if (uid && data) map[uid] = data;
          });
        }
        if (c.user) {
          const uid = c.user.uid || c.user.id;
          if (uid) map[uid] = c.user;
        }
        if (c.recipient) {
          const uid = c.recipient.uid || c.recipient.id;
          if (uid) map[uid] = c.recipient;
        }
      });
    }
    return map;
  }, [chats]);

  // Clean Deduplication Logic for 1-on-1 Chats in Sidebar, preserving Groups
  const deduplicatedChats = useMemo(() => {
    if (!Array.isArray(chats)) return [];
    
    const uniqueRooms = new Map();
    const groupRooms = [];
    
    chats.forEach((chat) => {
      if (chat.isGroup || chat.type === 'group') {
        groupRooms.push(chat);
        return;
      }
      // Find the recipient's UID in a 1-on-1 chat
      const targetId = chat.participants?.find(id => id !== currentUser?.uid);
      if (!targetId) return; // Skip invalid rooms
 
      if (!uniqueRooms.has(targetId)) {
        uniqueRooms.set(targetId, chat);
      } else {
        // If a duplicate exists, keep the one that has an actual message or newer timestamp
        const existing = uniqueRooms.get(targetId);
        const currentHasMessage = typeof chat.lastMessage === 'string' && chat.lastMessage.trim() !== '';
        const existingHasMessage = typeof existing.lastMessage === 'string' && existing.lastMessage.trim() !== '';
 
        if (currentHasMessage && !existingHasMessage) {
          uniqueRooms.set(targetId, chat);
        } else if (chat.updatedAt && existing.updatedAt && chat.updatedAt > existing.updatedAt) {
          uniqueRooms.set(targetId, chat);
        }
      }
    });
 
    return [...groupRooms, ...Array.from(uniqueRooms.values())];
  }, [chats, currentUser]);

  // Unread & Groups Computations
  const unreadCount = useMemo(() => {
    return deduplicatedChats.filter(c => (c.unreadCount || c.unreadCounts?.[currentUser?.uid] || 0) > 0).length;
  }, [deduplicatedChats, currentUser?.uid]);

  const groupsCount = useMemo(() => {
    return deduplicatedChats.filter(c => c.isGroup || c.type === 'group').length;
  }, [deduplicatedChats]);

  // Categorized Two-Tier Search Engine (Chats & Contacts + Messages)
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      const baseList = deduplicatedChats.filter((chat) => {
        if (activeFilter === 'unread') {
          const unread = chat.unreadCount || chat.unreadCounts?.[currentUser?.uid] || 0;
          return unread > 0;
        }
        if (activeFilter === 'groups') {
          return chat.isGroup || chat.type === 'group';
        }
        return true;
      });
      return { isSearching: false, chatMatches: baseList, messageMatches: [] };
    }

    const chatMatches = [];
    const messageMatches = [];

    deduplicatedChats.forEach((chat) => {
      const details = resolveChatDetails(chat, currentUser?.uid, allUsersList);
      
      // Multi-Field Matching: Name, Email, Username, Group Name/Desc, Messages
      const nameMatch = details.title.toLowerCase().includes(query);
      const emailMatch = (details.email || '').toLowerCase().includes(query);
      const usernameMatch = (details.username || '').toLowerCase().includes(query);
      const groupMatch = details.isGroup && (
        (chat.groupName || '').toLowerCase().includes(query) ||
        (chat.name || '').toLowerCase().includes(query) ||
        (chat.groupDescription || '').toLowerCase().includes(query)
      );

      const lastMsg = chat.lastMessage || chat.lastMessageText || chat.latestMessage?.text || '';
      const lastMsgMatch = String(lastMsg).toLowerCase().includes(query);

      // If contact name, email, username or group title/desc matches -> Chats & Contacts section
      if (nameMatch || emailMatch || usernameMatch || groupMatch) {
        chatMatches.push({
          ...chat,
          resolvedTitle: details.title,
          resolvedAvatar: details.avatar,
          resolvedEmail: details.email,
          resolvedUsername: details.username,
          resolvedIsGroup: details.isGroup,
        });
      } 
      // If message content matches -> Messages section
      else if (lastMsgMatch) {
        messageMatches.push({
          ...chat,
          resolvedTitle: details.title,
          resolvedAvatar: details.avatar,
          resolvedEmail: details.email,
          resolvedUsername: details.username,
          matchedSnippet: lastMsg,
        });
      }
    });

    return { isSearching: true, chatMatches, messageMatches };
  }, [deduplicatedChats, searchQuery, activeFilter, currentUser, allUsersList]);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <div className="w-full md:w-[350px] lg:w-[400px] h-full flex flex-col bg-[#0B111E] border-r border-slate-900 select-none flex-shrink-0 relative">
      
      {/* Top Header Profile Rail */}
      <div className="p-4 flex items-center justify-between border-b border-slate-900 bg-slate-900/40 select-none w-full box-border">
        {(() => {
          const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Logged In User';
          const userAvatarUrl = userService.resolveAvatar({
            ...(userProfile || {}),
            displayName: userDisplayName,
            photoURL: currentUser?.photoURL || userProfile?.avatarUrl
          });

          return (
            <div className="flex items-center gap-3 cursor-pointer overflow-hidden group" onClick={() => setShowProfileModal(true)}>
              {/* Dynamic Bordered Avatar Frame */}
              <div className="relative w-10 h-10 shrink-0">
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(userAvatarUrl);
                  }}
                  title="View profile picture"
                  className="w-full h-full rounded-full overflow-hidden border border-teal-500/40 bg-slate-800 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                >
                  <img src={userAvatarUrl} alt="User Account" className="w-full h-full object-cover" />
                </div>
                <PresenceBadge status={userProfile?.presenceStatus || 'online'} className="absolute bottom-0 right-0 z-10 scale-90" />
              </div>

              {/* Account Identity Node */}
              <div className="flex flex-col min-w-0 overflow-hidden text-left">
                {/* Dynamic Name or Email String */}
                <h4 className="text-sm font-bold text-slate-200 tracking-wide truncate max-w-[150px] md:max-w-[170px] group-hover:text-teal-400 transition-colors duration-150">
                  {userDisplayName}
                </h4>
                <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium tracking-wide">
                  {currentUser?.email || "Account Secure"}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* ⚙️ SETTINGS BUTTON */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
            className="p-2 text-white hover:text-teal-400 bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 rounded-xl transition-all duration-200 shadow-sm flex items-center justify-center group"
          >
            <svg 
              className="w-4 h-4 text-white group-hover:text-teal-400 transition-colors" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
              />
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
              />
            </svg>
          </button>

          {/* Actions Dropdown Container */}
          <div className="relative font-sans text-left" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-emerald-400 flex items-center justify-center transition-colors border border-slate-800 font-bold cursor-pointer text-lg"
              title="Add Chat Options"
            >
              +
            </button>
            
            {showAddMenu && (
              <div className="absolute right-0 mt-2.5 w-56 rounded-2xl bg-[#0B111E] border border-slate-800 shadow-2xl z-[999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="py-1">
                  {/* Start DM */}
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      setIsSearchOpen(true);
                    }}
                    className="flex items-center w-full px-4 py-3 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-teal-400 transition-colors text-left gap-3 cursor-pointer"
                  >
                    <span className="text-teal-400 text-sm">💬</span>
                    New Direct Message
                  </button>

                  {/* Create Group */}
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      setIsGroupCreateOpen(true);
                    }}
                    className="flex items-center w-full px-4 py-3 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-emerald-400 transition-colors text-left border-t border-slate-800/80 gap-3 cursor-pointer"
                  >
                    <span className="text-emerald-400 text-sm">👥</span>
                    Create New Group
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="px-2 py-1 text-xs font-black uppercase text-rose-400 hover:text-rose-300 border border-rose-950 bg-rose-950/10 hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* 2. TOP SEARCH BAR & STATUS BUTTON ROW */}
      <div className="px-3.5 py-2.5 flex items-center gap-2 select-none">
        
        {/* A. STATUS PILL BUTTON */}
        <button
          type="button"
          onClick={handleStatusButtonClick}
          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-500/80 bg-teal-950/30 hover:bg-teal-900/40 text-teal-400 hover:text-teal-300 transition-all cursor-pointer shrink-0 shadow-sm"
          title="Status Updates"
        >
          <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold tracking-wide">Status</span>

          {/* Notification Dot */}
          {statuses.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-400 border border-gray-950 animate-pulse" />
          )}
        </button>

        {/* B. SEARCH BAR PILL WITH INLINE FILTER */}
        <div className="relative flex-1 flex items-center gap-2 bg-[#0d1527]/90 border border-slate-800/80 focus-within:border-teal-500/60 rounded-full px-3 py-1.5 transition-all">
          {/* Search Icon */}
          <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          {/* Input */}
          <input
            type="text"
            placeholder="Search by name, username, email, group or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-500"
          />

          {/* Clear Search '✕' */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Clear search"
            >
              <svg className="w-3 h-3 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* INLINE FILTER TRIGGER BUTTON */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              className={`p-1 rounded-full transition-all flex items-center gap-1 cursor-pointer ${
                activeFilter !== 'all'
                  ? 'bg-teal-500/20 text-teal-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Filter Chats"
            >
              <svg className="w-3 h-3 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFilter !== 'all' && (
                <span className="text-[9px] font-bold uppercase tracking-tight text-teal-300">
                  {activeFilter}
                </span>
              )}
            </button>

            {/* FLOATING FILTER POPOVER MENU */}
            {isFilterMenuOpen && (
              <div className="absolute right-0 top-8 w-40 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                {[
                  { id: 'all', label: 'All Chats', icon: '💬', count: deduplicatedChats.length },
                  { id: 'unread', label: 'Unread', icon: '📬', count: unreadCount },
                  { id: 'groups', label: 'Groups', icon: '👥', count: groupsCount },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveFilter(item.id);
                      setIsFilterMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      activeFilter === item.id
                        ? 'bg-teal-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        activeFilter === item.id ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 3. CONVERSATION LIST / SEARCH RESULTS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-900/40">
        {chatsLoading ? (
          <p className="text-center text-slate-300 text-xs py-8">Updating chats stream...</p>
        ) : searchResults.isSearching ? (
          <div>
            {/* 1. CHATS SECTION */}
            {searchResults.chatMatches.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-950/90 text-[10px] font-extrabold uppercase tracking-wider text-teal-400 border-b border-gray-900 flex items-center justify-between">
                  <span>Chats & Contacts</span>
                  <span className="text-gray-500 font-bold">{searchResults.chatMatches.length}</span>
                </div>
                {searchResults.chatMatches.map((chat) => {
                  const targetId = chat.id || chat.chatId || chat.roomId;
                  const isGrp = chat.isGroup || chat.type === 'group';
                  return (
                    <div
                      key={targetId}
                      onClick={() => {
                        if (isGrp) {
                          setActiveChat({
                            id: targetId,
                            chatId: targetId,
                            groupName: chat.resolvedTitle,
                            groupAvatar: chat.resolvedAvatar || null,
                            groupDescription: chat.groupDescription || '',
                            admins: chat.admins || [chat.createdBy],
                            onlyAdminsCanMessage: chat.onlyAdminsCanMessage || false,
                            participants: chat.participants,
                            createdBy: chat.createdBy,
                            isGroup: true,
                            type: 'group'
                          });
                        } else {
                          const otherUid = chat.participants?.find(id => id !== currentUser?.uid);
                          setActiveChat({
                            id: targetId,
                            chatId: targetId,
                            roomId: targetId,
                            participants: chat.participants,
                            recipient: {
                              uid: otherUid,
                              displayName: chat.resolvedTitle,
                              photoURL: chat.resolvedAvatar,
                              email: chat.resolvedEmail
                            },
                            isGroup: false
                          });
                        }
                      }}
                      className="flex items-center gap-3 p-3 hover:bg-gray-900/60 cursor-pointer transition-colors"
                    >
                      <img
                        src={chat.resolvedAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.resolvedTitle || 'User')}&background=0d9488&color=fff&bold=true`}
                        alt=""
                        className="w-11 h-11 rounded-2xl object-cover border border-gray-800 shrink-0"
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <h4 className="text-xs font-bold text-white truncate">
                          <HighlightText text={chat.resolvedTitle} highlight={searchQuery} />
                        </h4>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {chat.resolvedIsGroup ? (
                            chat.groupDescription ? (
                              <HighlightText text={chat.groupDescription} highlight={searchQuery} />
                            ) : (
                              chat.lastMessage || 'Group conversation'
                            )
                          ) : chat.resolvedUsername && chat.resolvedUsername.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                            <span>
                              @<HighlightText text={chat.resolvedUsername} highlight={searchQuery} />
                              {chat.resolvedEmail && ` • ${chat.resolvedEmail}`}
                            </span>
                          ) : chat.resolvedEmail ? (
                            <HighlightText text={chat.resolvedEmail} highlight={searchQuery} />
                          ) : (
                            chat.lastMessage || 'Direct connection'
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. MESSAGES SECTION */}
            {searchResults.messageMatches.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-gray-950/90 text-[10px] font-extrabold uppercase tracking-wider text-teal-400 border-b border-gray-900 flex items-center justify-between">
                  <span>Messages</span>
                  <span className="text-gray-500 font-bold">{searchResults.messageMatches.length}</span>
                </div>
                {searchResults.messageMatches.map((chat) => {
                  const targetId = chat.id || chat.chatId || chat.roomId;
                  const isGrp = chat.isGroup || chat.type === 'group';
                  return (
                    <div
                      key={targetId}
                      onClick={() => {
                        if (isGrp) {
                          setActiveChat({
                            id: targetId,
                            chatId: targetId,
                            groupName: chat.resolvedTitle,
                            groupAvatar: chat.resolvedAvatar || null,
                            groupDescription: chat.groupDescription || '',
                            admins: chat.admins || [chat.createdBy],
                            onlyAdminsCanMessage: chat.onlyAdminsCanMessage || false,
                            participants: chat.participants,
                            createdBy: chat.createdBy,
                            isGroup: true,
                            type: 'group'
                          });
                        } else {
                          const otherUid = chat.participants?.find(id => id !== currentUser?.uid);
                          setActiveChat({
                            id: targetId,
                            chatId: targetId,
                            roomId: targetId,
                            participants: chat.participants,
                            recipient: {
                              uid: otherUid,
                              displayName: chat.resolvedTitle,
                              photoURL: chat.resolvedAvatar,
                              email: chat.resolvedEmail
                            },
                            isGroup: false
                          });
                        }
                      }}
                      className="flex items-center gap-3 p-3 hover:bg-gray-900/60 cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-teal-400 shrink-0 text-sm">
                        💬
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-gray-300 truncate">{chat.resolvedTitle}</h4>
                          <span className="text-[10px] text-gray-500">Recent</span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          <HighlightText text={chat.matchedSnippet} highlight={searchQuery} />
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* EMPTY SEARCH STATE */}
            {searchResults.chatMatches.length === 0 && searchResults.messageMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4 text-gray-500 select-none">
                <div className="w-10 h-10 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-2 text-gray-400">
                  🔍
                </div>
                <p className="text-xs font-semibold text-gray-300">No results found</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  No chats or messages matching &quot;{searchQuery}&quot;
                </p>
              </div>
            )}
          </div>
        ) : searchResults.chatMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4 text-gray-500 select-none">
            <div className="w-10 h-10 rounded-2xl bg-gray-900/80 border border-gray-800 flex items-center justify-center mb-2 text-gray-400 text-lg">
              💬
            </div>
            <p className="text-xs font-semibold text-gray-400">No conversations found</p>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="mt-3 text-xs font-black uppercase tracking-wider text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
            >
              Start Your First Conversation
            </button>
          </div>
        ) : (
          searchResults.chatMatches.map((c) => (
            <ChatListItem
              key={c.id || c.chatId || c.roomId || Math.random().toString()}
              chat={c}
              currentUser={currentUser}
              activeChat={activeChat}
              setActiveChat={setActiveChat}
              setPreviewImage={setPreviewImage}
            />
          ))
        )}
      </div>

      {/* Start Chat Modal */}
      <UserSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Create Group Modal */}
      <CreateGroupModal isOpen={isGroupCreateOpen} onClose={() => setIsGroupCreateOpen(false)} />

       {/* Profile Editor Modal */}
      <ProfileEditorModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
        currentUser={currentUser}
        userProfile={userProfile}
      />

      {/* Status Upload Modal */}
      {showUploadModal && (
        <StatusUploadModal 
          currentUser={currentUser} 
          onClose={() => setShowUploadModal(false)} 
        />
      )}

      {/* 1:1 WhatsApp Web Status Viewer Modal */}
      <WhatsAppStatusModal 
        isOpen={isStatusViewerOpen} 
        onClose={() => setIsStatusViewerOpen(false)} 
        currentUser={currentUser}
        statuses={statuses}
        usersDirectory={usersDirectory}
        onAddStatus={() => setShowUploadModal(true)}
      />

      {/* ⚙️ WHATSAPP-STYLE SETTINGS DRAWER (Slides in from left) */}
      {isSettingsOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-80 md:w-96 bg-slate-950 border-r border-slate-800/80 backdrop-blur-3xl flex flex-col shadow-2xl animate-drawer-slide-in select-none">
          
          {/* Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
            <div className="flex items-center gap-2.5">
              <span className="text-teal-400 text-lg">⚙️</span>
              <h2 className="text-base font-black uppercase tracking-wider text-white">Settings</h2>
            </div>
            <button 
              type="button"
              onClick={handleCloseSettings}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* CONDITIONAL RENDERING BASED ON ACTIVE VIEW */}
          {settingsView === "main" ? (
            /* Settings List (WhatsApp Style Menu) */
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-left">
              
              {/* 1. PRIVACY SETTINGS */}
              <button
                type="button"
                onClick={() => triggerComingSoon('Privacy Settings')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-teal-500/50 hover:bg-slate-800/40 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-105 transition-transform">
                    🔒
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors">
                        Privacy Settings
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300">
                        Soon
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Read receipts, Last seen, Profile photo</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* 2. CHANGE EMAIL ADDRESS */}
              <button
                type="button"
                onClick={() => triggerComingSoon('Change Email Address')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-teal-500/50 hover:bg-slate-800/40 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-105 transition-transform">
                    ✉️
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors">
                        Change Email Address
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300">
                        Soon
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Update primary security credentials</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* 3. ADD OR LINK ACCOUNT */}
              <button
                type="button"
                onClick={() => triggerComingSoon('Multi-Account Linking')}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-teal-500/50 hover:bg-slate-800/40 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0 group-hover:scale-105 transition-transform">
                    👥
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors">
                        Add or Link Account
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300">
                        Soon
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Switch between multi-user profiles</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* ⚡ 4. Support & FAQ Accordion Section */}
              <div 
                onClick={() => setSettingsView("support")}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/50 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">ℹ️</span>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">Support & FAQ</p>
                      <p className="text-[11px] text-slate-400">Help docs, call guides & support accordion</p>
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-white text-xs">➔</span>
                </div>
              </div>

              {/* 5. About App & Creator */}
              <div className="mt-6 p-4 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950 border border-slate-800 space-y-2 text-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-teal-400">Qwik Messages Enterprise</h3>
                <p className="text-[11px] text-slate-400 font-medium">Version 3.0.0</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-xs text-slate-300 font-semibold">
                  <span>Architected by <span className="text-white font-bold">Shreyas Thakur</span></span>
                  <span className="text-sm" title="India">🇮🇳</span>
                </div>
              </div>

            </div>
          ) : settingsView === "support" ? (
            /* --- SUPPORT & FAQ ACCORDION SUB-MENU --- */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left animate-fade-in">
              {/* Back button */}
              <button 
                type="button"
                onClick={() => setSettingsView("main")}
                className="flex items-center gap-2 text-xs font-bold text-teal-400 hover:text-white transition-colors cursor-pointer mb-2"
              >
                <span>← Back to Settings</span>
              </button>
              
              <SupportFAQ />
            </div>
          ) : (
            /* --- PRIVACY SETTINGS SUB-MENU --- */
            <div className="flex-1 overflow-y-auto p-4 space-y-5 text-left animate-fade-in">
              
              {/* Sub-Menu Header with Back Button */}
              <button 
                type="button"
                onClick={() => setSettingsView("main")}
                className="flex items-center gap-2 text-xs font-bold text-teal-400 hover:text-white transition-colors cursor-pointer mb-2"
              >
                <span>← Back to Settings</span>
              </button>

              {/* 1. LAST SEEN CONTROL */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>🕒</span> Who can see my Last Seen
                </h3>
                <div className="space-y-1.5 bg-slate-900/40 p-2 rounded-xl border border-slate-800/60">
                  {[
                    { label: "Everyone", value: "everyone" },
                    { label: "Contacts Only", value: "contacts" },
                    { label: "Nobody", value: "nobody" },
                    { label: "Specific Person...", value: "specific" },
                  ].map((opt) => (
                    <label 
                      key={opt.value} 
                      onClick={() => handlePrivacyChange("lastSeen", opt.value)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors select-none"
                    >
                      <span className="text-xs text-slate-300 font-medium">{opt.label}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${privacySettings.lastSeen === opt.value ? "border-teal-400 bg-teal-500/20 text-teal-400" : "border-slate-600"}`}>
                        {privacySettings.lastSeen === opt.value && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 2. PROFILE PHOTO CONTROL */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>🖼️</span> Who can see my Profile Photo
                </h3>
                <div className="space-y-1.5 bg-slate-900/40 p-2 rounded-xl border border-slate-800/60">
                  {[
                    { label: "Everyone", value: "everyone" },
                    { label: "Contacts Only", value: "contacts" },
                    { label: "Nobody", value: "nobody" },
                    { label: "Specific Person...", value: "specific" },
                  ].map((opt) => (
                    <label 
                      key={opt.value} 
                      onClick={() => handlePrivacyChange("profilePhoto", opt.value)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors select-none"
                    >
                      <span className="text-xs text-slate-300 font-medium">{opt.label}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${privacySettings.profilePhoto === opt.value ? "border-teal-400 bg-teal-500/20 text-teal-400" : "border-slate-600"}`}>
                        {privacySettings.profilePhoto === opt.value && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 3. READ RECEIPTS CONTROL */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <span>✓✓</span> Read Receipts (Blue Ticks)
                </h3>
                <div className="space-y-1.5 bg-slate-900/40 p-2 rounded-xl border border-slate-800/60">
                  {[
                    { label: "Everyone", value: "everyone" },
                    { label: "Contacts Only", value: "contacts" },
                    { label: "Nobody", value: "nobody" },
                    { label: "Specific Person...", value: "specific" },
                  ].map((opt) => (
                    <label 
                      key={opt.value} 
                      onClick={() => handlePrivacyChange("readReceipts", opt.value)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors select-none"
                    >
                      <span className="text-xs text-slate-300 font-medium">{opt.label}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${privacySettings.readReceipts === opt.value ? "border-teal-400 bg-teal-500/20 text-teal-400" : "border-slate-600"}`}>
                        {privacySettings.readReceipts === opt.value && <span className="text-[10px] font-bold">✓</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* DYNAMIC COMING SOON TOAST */}
      {comingSoonFeature && (
        <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-teal-500/50 shadow-2xl backdrop-blur-xl animate-toast-slide-in pointer-events-auto select-none max-w-sm w-full">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shrink-0">
              ⏳
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-white truncate">{comingSoonFeature} is coming soon!</div>
              <div className="text-[11px] text-slate-400">This capability will be unlocked in the next major update.</div>
            </div>
          </div>
        </div>
      )}

      {/* 👥 SPECIFIC PERSON CONTACT SELECTION MODAL */}
      {activeSpecificModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Select Contacts</h3>
                <p className="text-[11px] text-teal-400 font-medium capitalize">For {activeSpecificModal.replace(/([A-Z])/g, ' $1')}</p>
              </div>
              <button 
                type="button"
                onClick={() => setActiveSpecificModal(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Friend List with Checkboxes */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {deduplicatedChats.map((c) => (
                <ContactSelectorItem
                  key={c.chatId}
                  chat={c}
                  currentUser={currentUser}
                  activeSpecificModal={activeSpecificModal}
                  specificContacts={specificContacts}
                  setSpecificContacts={setSpecificContacts}
                />
              ))}
            </div>

            {/* Modal Footer / Save Button */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/50">
              <button
                type="button"
                onClick={() => setActiveSpecificModal(null)}
                className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg cursor-pointer"
              >
                Done ({specificContacts[activeSpecificModal]?.length || 0} Selected)
              </button>
            </div>          </div>
        </div>
      )}

    </div>
  );
}
