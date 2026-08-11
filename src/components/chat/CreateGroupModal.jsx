import React, { useState, useEffect } from 'react';
import { userService } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useRecipient } from '../../hooks/useRecipient';

function ContactCheckItem({ chat, currentUser, selectedIds, onToggle }) {
  const { recipient } = useRecipient(chat.participants, currentUser?.uid);
  const friendId = recipient?.uid;
  const friendName = recipient?.displayName || 'Loading...';
  const isChecked = friendId ? selectedIds.includes(friendId) : false;

  if (!friendId) return null;

  return (
    <label 
      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
        isChecked ? "bg-teal-500/10 border-teal-500/50" : "bg-slate-950/40 border-slate-800/60 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <img 
          src={recipient?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=0d9488&color=fff&bold=true`} 
          alt="" 
          className="w-8 h-8 rounded-full object-cover border border-slate-700"
        />
        <div className="text-left">
          <p className="text-xs font-bold text-white">{friendName}</p>
          <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{recipient?.email}</p>
        </div>
      </div>

      <input 
        type="checkbox" 
        checked={isChecked}
        onChange={() => onToggle(friendId)}
        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500/20"
      />
    </label>
  );
}

export default function CreateGroupModal({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const { chats, setActiveChat } = useChat();
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [loading, setLoading] = useState(false);

  // Get only direct chats to extract friends list
  const directChats = (chats || []).filter(c => !c.isGroup && c.participants && c.participants.length === 2);

  const handleToggleMember = (uid) => {
    setSelectedMemberIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleCreate = async (e) => {
    if (e) e.preventDefault();
    if (!groupName.trim()) {
      alert("Please enter a group name");
      return;
    }
    if (selectedMemberIds.length === 0) {
      alert("Please select at least one member to add");
      return;
    }

    setLoading(true);
    try {
      const allMembers = [...selectedMemberIds, currentUser.uid];
      const docRef = await addDoc(collection(db, "chats"), {
        groupName: groupName.trim(),
        createdBy: currentUser.uid,
        admins: [currentUser.uid],
        onlyAdminsCanMessage: false,
        participants: allMembers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isGroup: true,
        type: 'group',
        lastMessage: "Group created! 🎉",
        lastMessageTime: serverTimestamp()
      });

      console.log("Group successfully created with ID:", docRef.id);
      
      setActiveChat({
        id: docRef.id,
        chatId: docRef.id,
        groupName: groupName.trim(),
        createdBy: currentUser.uid,
        admins: [currentUser.uid],
        onlyAdminsCanMessage: false,
        participants: allMembers,
        isGroup: true,
        type: 'group'
      });

      // Clear states & close
      setGroupName('');
      setSelectedMemberIds([]);
      onClose();
    } catch (err) {
      console.error("Create group failed:", err);
      alert("Failed to create group: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none animate-fade-in">
      <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Top Gradient Accents */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-white uppercase tracking-wider">
            Create Group Chat
          </h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col flex-1 min-h-0">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left mb-1.5 pl-1">
            Group Name
          </label>
          <input
            type="text"
            required
            disabled={loading}
            placeholder="e.g. Project Alpha Devs"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-sm mb-4 transition-colors"
          />

          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left mb-2 pl-1">
            Select Members ({selectedMemberIds.length} chosen)
          </label>

          {/* Members List Selector Container */}
          <div className="flex-1 overflow-y-auto space-y-2 mb-6 pr-1 custom-scrollbar min-h-[150px]">
            {directChats.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-8">No friends available. Chat with direct contacts to add them here.</p>
            ) : (
              directChats.map((c) => (
                <ContactCheckItem 
                  key={c.chatId} 
                  chat={c} 
                  currentUser={currentUser} 
                  selectedIds={selectedMemberIds} 
                  onToggle={handleToggleMember}
                />
              ))
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !groupName.trim() || selectedMemberIds.length === 0}
            className="w-full py-3 bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Creating..." : "Create Group Chat"}
          </button>
        </form>

      </div>
    </div>
  );
}
