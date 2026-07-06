import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export function useCallManager(currentUser) {
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  // 1. Background Listener for Calls
  useEffect(() => {
    if (!currentUser?.uid) {
      setIncomingCall(null);
      setActiveCall(null);
      return;
    }

    const callsRef = collection(db, 'calls');
    // Listen to calls where the current user is a participant
    const q = query(
      callsRef,
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let foundIncoming = null;
      let foundActive = null;

      snapshot.forEach((changeDoc) => {
        const data = changeDoc.data();
        const callId = changeDoc.id;
        const call = { callId, ...data };

        // Check if the call is still active
        if (call.status === 'ended') {
          return;
        }

        // If the current user has already accepted and is in connectedUsers, it's their active call
        if (call.connectedUsers?.includes(currentUser.uid)) {
          foundActive = call;
        } 
        // If the call is ringing, user is in participants but not in connectedUsers or rejectedUsers
        else if (call.status === 'ringing' && !call.rejectedUsers?.includes(currentUser.uid)) {
          // Verify it's a relatively recent call to avoid old stale calls ringing (created within the last 5 minutes)
          const createdAtMs = call.createdAt?.toMillis ? call.createdAt.toMillis() : (call.createdAt ? new Date(call.createdAt).getTime() : Date.now());
          const age = Date.now() - createdAtMs;
          if (age < 300000) { // 5 minutes window
            foundIncoming = call;
          }
        }
      });

      setIncomingCall(foundIncoming);
      setActiveCall(foundActive);
    }, (error) => {
      console.error("Error listening to calls:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // 2. Initiate Call
  const initiateCall = async (activeChat, callType = 'video') => {
    if (!activeChat || !currentUser) return;

    // Ensure all group participants or 1-on-1 partners are included (Excluding the current user to prevent self-ringing)
    const allParticipants = Array.isArray(activeChat.participants) 
      ? [...activeChat.participants]
      : [activeChat.uid, currentUser.uid].filter(Boolean);

    // Fallback: Make sure current user is implicitly part of the document array
    if (!allParticipants.includes(currentUser.uid)) {
      allParticipants.push(currentUser.uid);
    }

    const uniqueRoomName = `vpaas-magic-cookie-c21a564e57a14e4db0d9c7bed344172e/qwik_group_room_${Date.now()}_${currentUser.uid}`;

    try {
      const docRef = await addDoc(collection(db, 'calls'), {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || 'Host User',
        hostAvatar: currentUser.photoURL || '',
        chatName: activeChat.displayName || activeChat.name || 'Group Call', // Handles group name resolution
        participants: allParticipants, // Broad list: Array of UIDs for bulk group ringing
        roomName: uniqueRoomName,
        type: callType,
        status: 'ringing', // Triggers everyone's listener globally
        createdAt: serverTimestamp(),
        connectedUsers: [currentUser.uid], // Track who has accepted the call
        rejectedUsers: []
      });
      return docRef;
    } catch (err) {
      console.error("Failed to trigger group call:", err);
      throw err;
    }
  };

  // 3. Accept Call
  const acceptCall = async (callId) => {
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, {
        connectedUsers: arrayUnion(currentUser.uid),
        status: 'connected' // update status to active/connected
      });
    } catch (err) {
      console.error("Failed to accept call:", err);
    }
  };

  // 4. Decline/Reject Call
  const declineCall = async (callId) => {
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, {
        rejectedUsers: arrayUnion(currentUser.uid)
      });
      setIncomingCall(null);
    } catch (err) {
      console.error("Failed to decline call:", err);
    }
  };

  // 5. End Call (for everyone or just leave)
  const endCall = async (callId) => {
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, {
        status: 'ended'
      });
      setActiveCall(null);
    } catch (err) {
      console.error("Failed to end call:", err);
    }
  };

  return {
    incomingCall,
    activeCall,
    initiateCall,
    acceptCall,
    declineCall,
    endCall
  };
}
