import React, { useState, useEffect } from 'react';
import { userService } from '../../services/userService';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function UserSearchModal({ isOpen, onClose, targetGroupId = null, existingParticipants = [] }) {
  const { currentUser } = useAuth();
  const { chats, setActiveChat } = useChat();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [systemUsers, setSystemUsers] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // 1. DEBOUNCE EFFECT: Smooths out typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm.trim());
    }, 400); // 400ms delay
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. MASTER FETCH EFFECT: Strictly restricted dependencies to prevent infinite loops
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const fetchUsers = async () => {
      if (systemUsers.length === 0 && isMounted) {
        setIsInitialLoad(true);
      }

      try {
        const users = await userService.getAllUsers();
        if (isMounted) {
          // Filter out current user and existing group participants
          setSystemUsers(users.filter(u => u.uid !== currentUser?.uid && !existingParticipants.includes(u.uid)));
          setIsInitialLoad(false);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        if (isMounted) {
          setSystemUsers([]);
          setIsInitialLoad(false);
        }
      }
    };

    if (currentUser?.uid) {
      fetchUsers();
    }

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentUser?.uid, existingParticipants]);

  if (!isOpen) return null;

  // Case-Insensitive Client-Side Search
  const filteredUsers = systemUsers.filter((u) => {
    const term = debouncedTerm.toLowerCase();
    if (!term) return true; // Show initial user list if search is empty to match specification
    const name = (u.displayName || u.name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const username = (u.userName || u.username || '').toLowerCase();
    return name.includes(term) || email.includes(term) || username.includes(term);
  });

  const handleSelectUser = async (targetUser) => {
    if (targetGroupId) {
      try {
        const chatDocRef = doc(db, "chats", targetGroupId);
        await setDoc(chatDocRef, {
          participants: arrayUnion(targetUser.uid)
        }, { merge: true });
        alert(`${targetUser.displayName || 'User'} has been added to the group!`);
        onClose();
        setSearchTerm('');
      } catch (err) {
        console.error("Add user to group failed:", err);
        alert("Failed to add user to group.");
      }
      return;
    }

    const targetId = targetUser.uid;
    const existingRoom = chats.find(c => c.participants?.includes(targetId) && c.type !== 'group');

    if (existingRoom) {
      setActiveChat({
        chatId: existingRoom.chatId,
        recipient: targetUser,
        participants: existingRoom.participants
      });
      onClose();
      setSearchTerm('');
      return;
    }

    try {
      const activeRoom = await chatService.initiateChatRoom(currentUser, targetUser);
      // Direct UI redirect to active chat
      setActiveChat(activeRoom);
      onClose();
      setSearchTerm('');
    } catch (err) {
      console.error("Chat initiation failed:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
      {/* Central Modal Container */}
      <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col">
        {/* Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-white uppercase tracking-wider">
            Start New Chat
          </h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Input */}
        <input
          type="text"
          placeholder="Search by name, email, or username..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm mb-4 transition-colors"
          autoFocus
        />

        {/* Result List */}
        <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {isInitialLoad ? (
            <p className="text-center text-slate-300 text-xs py-8 animate-pulse">Loading system directories...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-8">
              {debouncedTerm ? `No results found for "${debouncedTerm}"` : "No other users found in directory."}
            </p>
          ) : (
            filteredUsers.map((u) => {
              const avatarSrc = userService.resolveAvatar(u);
              return (
                <div 
                  key={u.uid}
                  onClick={() => handleSelectUser(u)}
                  className="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99]"
                >
                  <img src={avatarSrc} alt={u.displayName} className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-grow min-w-0">
                    <h4 className="text-white text-sm font-bold truncate flex items-center gap-1.5">
                      {u.displayName || 'User'}
                      {u.username && (
                        <span className="text-[10px] text-emerald-400 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {u.username}
                        </span>
                      )}
                    </h4>
                    <p className="text-slate-300 text-xs truncate font-medium">{u.email}</p>
                  </div>
                  <span className="text-emerald-400 text-sm font-bold">
                    {targetGroupId ? "Add" : "Chat"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
