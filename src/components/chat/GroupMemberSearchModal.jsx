import React, { useState, useEffect } from 'react';
import { userService } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function GroupMemberSearchModal({ isOpen, onClose, activeGroupId, existingParticipants }) {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [systemUsers, setSystemUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const loadUsers = async () => {
      setLoading(true);
      try {
        const users = await userService.getAllUsers();
        // Filter out current user AND users already in the group
        const filtered = users.filter(u => u.uid !== currentUser?.uid && !existingParticipants?.includes(u.uid));
        setSystemUsers(filtered);
      } catch (err) {
        console.error("Error loading search users for group:", err);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, [isOpen, currentUser, existingParticipants]);

  if (!isOpen) return null;

  const filteredUsers = systemUsers.filter((u) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return false;
    const name = (u.displayName || u.name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const username = (u.userName || u.username || '').toLowerCase();
    return name.includes(term) || email.includes(term) || username.includes(term);
  });

  const handleAddUser = async (targetUser) => {
    try {
      const chatDocRef = doc(db, "chats", activeGroupId);
      await setDoc(chatDocRef, {
        participants: arrayUnion(targetUser.uid)
      }, { merge: true });
      console.log("Added member to group via search:", targetUser.uid);
      alert(`${targetUser.displayName || 'User'} has been added to the group.`);
      onClose();
      setSearchTerm('');
    } catch (err) {
      console.error("Group member add failed:", err);
      alert("Failed to add member.");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none font-sans text-left">
      <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">
            Add Group Member
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button>
        </div>

        <input
          type="text"
          placeholder="Search friends by name, email or username..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-xs mb-4"
          autoFocus
        />

        <div className="max-h-[250px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {loading ? (
            <p className="text-center text-slate-400 text-xs py-6">Loading directory...</p>
          ) : searchTerm && filteredUsers.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-6">No matches found for "{searchTerm}"</p>
          ) : !searchTerm ? (
            <p className="text-center text-slate-400 text-xs py-6">Type to search for users to add...</p>
          ) : (
            filteredUsers.map((u) => {
              const avatarSrc = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.email)}&background=0f172a&color=cbd5e1`;
              return (
                <div 
                  key={u.uid}
                  onClick={() => handleAddUser(u)}
                  className="flex items-center gap-3 p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99]"
                >
                  <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="flex-grow min-w-0">
                    <h4 className="text-white text-xs font-bold truncate flex items-center gap-1.5">
                      {u.displayName || 'User'}
                      {u.username && (
                        <span className="text-[9px] text-emerald-400 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          {u.username}
                        </span>
                      )}
                    </h4>
                    <p className="text-slate-400 text-[10px] truncate">{u.email}</p>
                  </div>
                  <span className="text-emerald-400 text-xs font-bold uppercase">Add</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
