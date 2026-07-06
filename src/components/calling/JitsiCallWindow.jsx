import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { userService } from '../../services/userService';

const JitsiCallWindow = ({ callData, currentUser, onClose }) => {
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [allUsers, setAllUsers] = useState([]); // Populate with system contact/users list
  const [currentParticipants, setCurrentParticipants] = useState(callData.participants || []);

  // Fetch all users on mount
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await userService.getAllUsers();
        setAllUsers(users);
      } catch (err) {
        console.error("Error loading users for invite:", err);
      }
    };
    loadUsers();
  }, []);

  // Sync participants list in real time to see hot-joined users
  useEffect(() => {
    if (!callData?.callId) return;
    const unsub = onSnapshot(doc(db, 'calls', callData.callId), (snapshot) => {
      if (snapshot.exists()) {
        setCurrentParticipants(snapshot.data().participants || []);
      }
    });
    return () => unsub();
  }, [callData]);

  // Inject New User into Active Call Handler
  const handleInjectGuest = async (targetUserUid) => {
    if (currentParticipants.includes(targetUserUid)) {
      alert("User is already invited or in the call!");
      return;
    }

    try {
      const callRef = doc(db, 'calls', callData.callId);
      // Atomic injection: add user to participants AND re-trigger ringing state for them
      await updateDoc(callRef, {
        participants: arrayUnion(targetUserUid),
        status: "ringing" // Forces the background listener to sound the alarm on the target user's laptop mid-session
      });
      alert("Invitation sent! They can hot-join now.");
      setShowAddGuest(false);
    } catch (err) {
      console.error("Failed to inject guest into active conference:", err);
    }
  };

  const roomName = callData.roomName;
  const myName = currentUser?.displayName || 'User';

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-950 z-[999999] flex flex-col relative select-none">
      
      {/* Top Floating Control Bar Overlay for Hot-Joining */}
      <div className="absolute top-4 right-4 z-[9999999] flex items-center gap-3">
        <button 
          onClick={() => setShowAddGuest(!showAddGuest)}
          className="px-4 py-2 bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          ➕ Add Member to Call
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-rose-900 rounded-xl transition-colors cursor-pointer"
        >
          Disconnect Call
        </button>
      </div>

      {/* Guest Injection Search Dropdown Panel */}
      {showAddGuest && (
        <div className="absolute top-16 right-4 z-[9999999] w-64 bg-[#0B111E] border border-slate-800 rounded-2xl shadow-2xl p-3 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-3 duration-200">
          <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2 px-1">Invite online contacts:</h3>
          {/* Loop over available app users to invite */}
          {allUsers.filter(u => u.uid !== currentUser.uid).map((user) => (
            <div 
              key={user.uid} 
              onClick={() => handleInjectGuest(user.uid)}
              className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
            >
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email || 'U')}`} className="w-6 h-6 rounded-full" alt=""/>
              <span className="text-xs font-medium text-slate-200 truncate">{user.displayName || user.email}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main 8x8 JaaS Hardware Container */}
      <div id="jitsi-container" className="w-full flex-1 h-full bg-slate-900">
        <iframe
          src={`https://meet.jit.si/${roomName}#userInfo.displayName="${encodeURIComponent(myName)}"`}
          className="w-full h-full border-none"
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          title="HD Video Stream"
        />
      </div>
    </div>
  );
};

export default JitsiCallWindow;
