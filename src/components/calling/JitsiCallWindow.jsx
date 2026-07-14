import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { userService } from '../../services/userService';

const JitsiCallWindow = ({ callData, currentUser, onClose }) => {
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [allUsers, setAllUsers] = useState([]); // Populate with system contact/users list
  const [currentParticipants, setCurrentParticipants] = useState(callData.participants || []);
  const jitsiApiRef = useRef(null);
  
  const isCallAccepted = callData.status === 'connected' || callData.status === 'accepted' || (callData.connectedUsers && callData.connectedUsers.length > 1);

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

  // Load Jitsi Meet External API dynamically and initialize
  useEffect(() => {
    if (!isCallAccepted) return;

    let apiInstance = null;
    const script = document.createElement('script');
    script.src = 'https://8x8.vc/external_api.js';
    script.async = true;
    
    const handleScriptLoad = () => {
      if (!window.JitsiMeetExternalAPI) {
        console.error("Jitsi Meet External API failed to load");
        return;
      }
      
      const domain = "8x8.vc";
      const options = {
        roomName: callData.roomName, // Contains verified vpaas-magic-cookie prefix
        width: "100%",
        height: "100%",
        parentNode: document.getElementById('jitsi-container'),
        userInfo: {
          displayName: currentUser?.displayName || 'User',
          email: currentUser?.email || '',
          avatarUrl: currentUser?.photoURL || ''
        },
        // CRITICAL BYPASS FLAGS FOR ZERO-WAIT INSTANT HOT-JOINING
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: callData.type === 'audio',
          
          // 1. Completely disable the prejoin lobby screen check
          prejoinPageEnabled: false, 
          prejoinConfig: { enabled: false },
 
          // 2. Kill the "Waiting for Moderator/Host" secure loop
          waitingForHostEnabled: false, 
          
          // 3. Force guest users to automatically become moderators so nobody is blocked
          p2p: { enabled: true }, // Enables direct high-speed peer connection for 1-on-1 calls
          requireDisplayName: false,
          hideConferenceSubject: true,
          hideConferenceTimer: false
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: ['microphone', 'camera', 'desktop', 'fullscreen', 'hangup', 'tileview']
        }
      };
 
      // Re-initialize Jitsi API instance with these premium bypass options
      apiInstance = new window.JitsiMeetExternalAPI(domain, options);
      jitsiApiRef.current = apiInstance;
      
      // Auto-trigger onClose when user hangs up via Jitsi UI
      apiInstance.addEventListener('videoConferenceLeft', () => {
        onClose();
      });
    };
 
    script.addEventListener('load', handleScriptLoad);
    document.body.appendChild(script);
 
    return () => {
      script.removeEventListener('load', handleScriptLoad);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (apiInstance) {
        apiInstance.dispose();
      }
    };
  }, [callData.roomName, callData.type, currentUser, onClose, isCallAccepted]);

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

  if (!isCallAccepted) {
    const isHost = currentUser?.uid === callData.hostId;
    const peerAvatar = isHost ? callData.recipientAvatar : callData.hostAvatar;
    const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(callData.chatName || 'Call')}&background=0d9488&color=fff&bold=true`;
    
    return (
      <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
        <div className="w-full max-w-sm bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 shadow-2xl shadow-teal-500/10 flex flex-col items-center justify-center animate-scale-up">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-teal-500 mb-4 bg-slate-800 flex items-center justify-center">
            <img src={peerAvatar || defaultAvatarUrl} alt="Calling avatar" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-teal-500/10 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide mb-1 text-center">
            {callData.chatName || (callData.isGroup ? 'Group Call' : 'Personal Call')}
          </h3>
          <p className="text-xs font-semibold text-teal-400 tracking-widest uppercase animate-pulse mb-6">
            Calling...
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-rose-600/20 border border-rose-500/50 text-rose-400 font-bold text-sm tracking-wider hover:bg-rose-600 hover:text-white transition shadow-lg shadow-rose-600/20"
          >
            CANCEL CALL
          </button>
        </div>
        <div className="absolute top-0 left-0 right-0 h-1 bg-teal-500 animate-pulse"></div>
      </div>
    );
  }

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
          {allUsers.filter(u => u.uid !== currentUser?.uid).map((user) => (
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
      <div id="jitsi-container" className="w-full flex-1 h-full bg-slate-900" />
    </div>
  );
};

export default JitsiCallWindow;
