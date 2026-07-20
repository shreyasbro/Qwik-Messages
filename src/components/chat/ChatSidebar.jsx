import React, { useState, useMemo } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { useRecipient } from '../../hooks/useRecipient';
import { safeString } from '../../utils/safeRender';
import UserSearchModal from './UserSearchModal';
import ProfileEditorModal from '../profile/ProfileEditorModal';

function ChatListItem({ chat, currentUser, activeChat, setActiveChat }) {
  const { recipient } = useRecipient(chat.participants, currentUser?.uid);
  const chatName = recipient?.displayName || 'Loading...';
  const avatarSrc = recipient?.photoURL || userService.resolveAvatar({ displayName: chatName });
  const isActive = activeChat?.chatId === chat.chatId;

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
      className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] border ${
        isActive 
          ? 'bg-slate-900 border-slate-800 shadow-md shadow-black' 
          : 'bg-transparent border-transparent hover:bg-slate-900/40 hover:border-slate-900'
      }`}
    >
      <img src={avatarSrc} alt={safeString(chatName)} className="w-11 h-11 rounded-full object-cover border border-white/5 flex-shrink-0" />
      <div className="flex-grow min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <h4 className="text-white text-sm font-bold truncate pr-2">{safeString(chatName)}</h4>
          {chat.lastMessageTime && (
            <span className="text-[10px] text-slate-500 font-bold">
              {formatTimeSafe(chat.lastMessageTime)}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-300 truncate max-w-[180px] font-medium">
          {safeString(chat.lastMessage || 'Say hi to your new friend! 👋')}
        </p>
      </div>
    </div>
  );
}

export default function ChatSidebar() {
  const { chats, activeChat, setActiveChat, chatsLoading } = useChat();
  const { currentUser, userProfile } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

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
    <div className="w-full md:w-[350px] lg:w-[400px] h-full flex flex-col bg-[#0B111E] border-r border-slate-900 select-none flex-shrink-0">
      
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
              <div className="relative w-10 h-10 rounded-full overflow-hidden border border-teal-500/40 bg-slate-800 flex items-center justify-center shrink-0">
                <img src={userAvatarUrl} alt="User Account" className="w-full h-full object-cover" />
              </div>

              {/* Account Identity Node */}
              <div className="flex flex-col min-w-0 overflow-hidden">
                {/* Dynamic Name or Email String */}
                <h4 className="text-sm font-bold text-slate-200 tracking-wide truncate max-w-[150px] md:max-w-[170px] group-hover:text-teal-400 transition-colors duration-150">
                  {userDisplayName}
                </h4>
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-0.5">
                  {userProfile?.status || 'ONLINE'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
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

    </div>
  );
}
