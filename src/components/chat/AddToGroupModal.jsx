import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { userService } from '../../services/userService';

export default function AddToGroupModal({ currentUser, targetUser, closeModal }) {
  const [myGroups, setMyGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyGroups = async () => {
      try {
        // Fetch groups from chats collection where type === 'group' and participants array contains currentUser.uid
        const q = query(
          collection(db, "chats"), 
          where("type", "==", "group"), 
          where("participants", "array-contains", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const groupsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMyGroups(groupsData);
      } catch (error) {
        console.error("Error fetching groups:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMyGroups();
  }, [currentUser.uid]);

  const handleAddToGroup = async (group) => {
    const userIdToAdd = targetUser?.uid || targetUser?.recipient?.uid || targetUser?.recipient?.id || targetUser?.id || targetUser?.userId;
    if (!userIdToAdd) {
      console.error("Missing User ID! Target User Object:", targetUser);
      alert("Error: Cannot find a valid User ID to add.");
      return;
    }

    try {
      const groupRef = doc(db, "chats", group.id);
      await setDoc(groupRef, {
        participants: arrayUnion(userIdToAdd),
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert(`Successfully added to group: ${group.groupName}`);
      closeModal();
    } catch (error) {
      console.error("Error adding to group:", error);
      alert("Failed to add user to group.");
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans select-none text-left">
      <div className="bg-[#0B111E] border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh] relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400"></div>

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-900">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Add to Group</h2>
          <button onClick={closeModal} className="text-slate-400 hover:text-white p-1 transition-colors">
            ✕
          </button>
        </div>

        {/* Group List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 custom-scrollbar">
          {loading ? (
            <div className="text-center text-slate-400 text-xs py-8">Loading groups...</div>
          ) : myGroups.length === 0 ? (
            <div className="text-center text-slate-400 text-xs py-8">You aren't a member of any groups yet.</div>
          ) : (
            myGroups.map(group => {
              const participants = group.participants || [];
              const targetId = targetUser?.uid || targetUser?.recipient?.uid || targetUser?.recipient?.id || targetUser?.id || targetUser?.userId;
              const isAlreadyMember = targetId ? participants.includes(targetId) : false;
              const groupAvatarUrl = group.groupAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.groupName)}&background=0d9488&color=fff&bold=true`;
              return (
                <div key={group.id} className="flex items-center justify-between p-3.5 bg-slate-900/50 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 rounded-2xl transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={groupAvatarUrl} 
                      alt="" 
                      className="w-10 h-10 rounded-xl object-cover border border-slate-800 shrink-0" 
                    />
                    <div className="truncate">
                      <h4 className="text-xs font-black text-white truncate">{group.groupName}</h4>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{participants.length} members</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => !isAlreadyMember && handleAddToGroup(group)}
                    disabled={isAlreadyMember}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 cursor-pointer ${
                      isAlreadyMember 
                        ? 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed' 
                        : 'bg-teal-500/10 hover:bg-teal-500 hover:text-slate-950 border-teal-500/40 hover:border-teal-400 text-teal-400'
                    }`}
                  >
                    {isAlreadyMember ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
