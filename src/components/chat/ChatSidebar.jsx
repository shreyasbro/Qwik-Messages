import React, { useState, useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { useRecipient } from '../../hooks/useRecipient';
import { safeString } from '../../utils/safeRender';
import UserSearchModal from './UserSearchModal';
import ProfileEditorModal from '../profile/ProfileEditorModal';
import SupportFAQ from './SupportFAQ';

function ChatListItem({ chat, currentUser, activeChat, setActiveChat, setPreviewImage }) {
  const { recipient } = useRecipient(chat.participants, currentUser?.uid);
  const chatName = recipient?.displayName || 'Loading...';
  const avatarSrc = recipient?.photoURL || userService.resolveAvatar({ displayName: chatName });
  const isActive = activeChat?.chatId === chat.chatId;

  // Real-time typing status tracking state
  const [isTyping, setIsTyping] = React.useState(false);

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
        if (!recipient) return;
        setActiveChat({
          chatId: chat.chatId,
          recipient: recipient,
          participants: chat.participants
        });
      }}
      className={`flex items-center gap-4 p-3.5 mx-2 mb-1.5 rounded-2xl cursor-pointer transition-all duration-300 ease-in-out border ${
        isActive 
          ? 'bg-slate-800/60 border-slate-700/50 shadow-lg shadow-black/25' 
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
            className="absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-950 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse"
          />
        ) : (
          <span 
            className="absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-950 rounded-full bg-slate-500 scale-90"
          />
        )}
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
        <div className={`text-[11px] truncate max-w-[180px] font-medium ${isTyping ? "text-emerald-400 font-semibold" : "text-slate-400"}`}>
          {isTyping ? "typing..." : safeString(chat.lastMessage || 'Say hi to your new friend! 👋')}
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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState("main"); // 'main' | 'privacy'
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
 
  // Clean Deduplication Logic for 1-on-1 Chats in Sidebar
  const deduplicatedChats = useMemo(() => {
    if (!Array.isArray(chats)) return [];
    
    const uniqueRooms = new Map();
    
    chats.forEach((chat) => {
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

    return Array.from(uniqueRooms.values());
  }, [chats, currentUser]);

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
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(userAvatarUrl);
                }}
                title="View profile picture"
                className="relative w-10 h-10 rounded-full overflow-hidden border border-teal-500/40 bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
              >
                <img src={userAvatarUrl} alt="User Account" className="w-full h-full object-cover" />
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
            title="App Settings"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-450 hover:text-teal-400 transition-all cursor-pointer shadow-sm"
          >
            <svg className="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* New Chat Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-emerald-400 flex items-center justify-center transition-colors border border-slate-800 font-bold cursor-pointer"
            title="Start new conversation"
          >
            ＋
          </button>
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="px-2 py-1 text-xs font-black uppercase text-rose-400 hover:text-rose-300 border border-rose-950 bg-rose-950/10 hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Chat Room Stream List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1">
        {chatsLoading ? (
          <p className="text-center text-slate-300 text-xs py-8">Updating chats stream...</p>
        ) : deduplicatedChats.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-slate-400 text-sm font-medium">No chats started yet.</p>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="mt-3 text-xs font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Start Your First Conversation
            </button>
          </div>
        ) : (
          deduplicatedChats.map((c) => (
            <ChatListItem
              key={c.chatId}
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

      {/* Profile Editor Modal */}
      <ProfileEditorModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
        currentUser={currentUser}
        userProfile={userProfile}
      />

      {/* ⚙️ WHATSAPP-STYLE SETTINGS DRAWER (Slides in from left) */}
      {isSettingsOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-80 md:w-96 bg-slate-950 border-r border-slate-800/80 backdrop-blur-3xl flex flex-col shadow-2xl animate-fade-in select-none animate-slide-in">
          
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
              
              {/* 1. Privacy Settings */}
              <div 
                onClick={() => setSettingsView("privacy")}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/50 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔒</span>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">Privacy Settings</p>
                      <p className="text-[11px] text-slate-400">Read receipts, Last seen, Profile photo</p>
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-white text-xs">➔</span>
                </div>
              </div>

              {/* 2. Change Email Feature */}
              <div 
                onClick={() => alert("📧 The 'Change Email Address' feature is currently under development and will be available in the next update!")}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📧</span>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">Change Email Address</p>
                      <p className="text-[11px] text-slate-400">Update primary security credentials</p>
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-white text-xs">➔</span>
                </div>
              </div>

              {/* 3. Link Second Account */}
              <div 
                onClick={() => alert("🔗 The 'Add or Link Account' feature is currently under development and will be available in the next update!")}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">👥</span>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">Add or Link Account</p>
                      <p className="text-[11px] text-slate-400">Switch between multi-user profiles</p>
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-white text-xs">➔</span>
                </div>
              </div>

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
