import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  increment
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const chatService = {
  // Atomic chat room creation with sorted participant ids and merge: true
  initiateChatRoom: async (currentUser, targetUser) => {
    const uid1 = currentUser.uid;
    const uid2 = targetUser.uid || targetUser.id;
    if (!uid1 || !uid2) throw new Error('Missing user UIDs');

    const chatId = uid1 > uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
    const chatRoomRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRoomRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRoomRef, {
        chatId: chatId,
        type: 'direct',
        participants: [uid1, uid2],
        participantData: [
          { 
            uid: uid1, 
            displayName: currentUser.displayName || 'User', 
            photoURL: currentUser.photoURL || null 
          },
          { 
            uid: uid2, 
            displayName: targetUser.displayName || targetUser.name || 'User', 
            photoURL: targetUser.photoURL || targetUser.customAvatarUrl || null 
          }
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: null,
        lastMessageTime: null
      }, { merge: true });
    }

    return {
      chatId,
      recipient: targetUser,
      participants: [uid1, uid2]
    };
  },

  // Leave Group
  leaveGroup: async (chatId, userId) => {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) return;

    const data = chatSnap.data();
    const updatedParticipants = (data.participants || []).filter(p => p !== userId);

    if (updatedParticipants.length === 0) {
      await deleteDoc(chatRef);
    } else {
      await setDoc(chatRef, {
        participants: updatedParticipants,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  },

  // Delete Group Globally (Creator Only)
  deleteGroupGlobally: async (chatId) => {
    const chatRef = doc(db, 'chats', chatId);
    return deleteDoc(chatRef);
  },

  // Delete Chat History (Clear direct chat subcollection messages - Soft delete for me)
  clearChatHistory: async (chatId, userId) => {
    if (!userId || !chatId) return;
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const qSnapshot = await getDocs(messagesRef);

    // Use Firestore WriteBatch for high-performance atomic updates
    const batch = writeBatch(db);
    let count = 0;

    qSnapshot.forEach((documentSnap) => {
      const msgData = documentSnap.data();
      if (!msgData.deletedFor?.includes(userId)) {
        const msgDocRef = doc(db, 'chats', chatId, 'messages', documentSnap.id);
        batch.update(msgDocRef, {
          deletedFor: arrayUnion(userId)
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ Successfully cleared ${count} messages for user:`, userId);
    }
  },

  // Send message
  sendMessage: async (chatId, senderId, text, mediaUrl = null, replyTo = null) => {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const msgData = {
      senderId,
      text,
      mediaUrl,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    };
    if (replyTo) {
      msgData.replyTo = replyTo;
    }

    const docRef = await addDoc(messagesRef, msgData);

    // Fetch existing room participants to increment unread count for recipients
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const participants = chatSnap.exists() ? (chatSnap.data().participants || []) : [];
    const otherParticipants = participants.filter(id => id !== senderId);

    const updatePayload = {
      lastMessage: text || (mediaUrl ? '📁 Attachment' : ''),
      lastMessageTime: new Date().toISOString(),
      lastMessageSenderId: senderId,
      updatedAt: serverTimestamp()
    };

    otherParticipants.forEach((uid) => {
      updatePayload[`unreadCounts.${uid}`] = increment(1);
    });

    await setDoc(chatRef, updatePayload, { merge: true });

    return docRef.id;
  },

  // Edit message text
  editMessage: async (chatId, messageId, newText) => {
    const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
    await setDoc(msgRef, {
      text: newText,
      isEdited: true,
      editedAt: serverTimestamp()
    }, { merge: true });
  },

  // Delete message for me only
  deleteMessageForMe: async (chatId, messageId, userId) => {
    const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
    await setDoc(msgRef, {
      deletedFor: arrayUnion(userId)
    }, { merge: true });
  },

  // Delete individual message (Instagram-Style WIPE)
  deleteMessage: async (chatId, messageId) => {
    const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
    await deleteDoc(msgRef);

    // Rollback lastMessage if deleted message was the latest
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
    const snapshot = await getDocs(q);

    let newLastMessage = null;
    let newLastMessageTime = null;

    if (!snapshot.empty) {
      const msgData = snapshot.docs[0].data();
      newLastMessage = msgData.text || (msgData.mediaUrl ? '📁 Attachment' : '');
      newLastMessageTime = msgData.createdAt || null;
    }

    await setDoc(doc(db, 'chats', chatId), {
      lastMessage: newLastMessage,
      lastMessageTime: newLastMessageTime,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  // Leave Group: remove user UID from participants array
  leaveGroup: async (chatId, userId) => {
    const { arrayRemove } = await import('firebase/firestore');
    const roomRef = doc(db, 'chats', chatId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const currentParticipants = roomSnap.data().participants || [];
      const updated = currentParticipants.filter(id => id !== userId);
      await setDoc(roomRef, {
        participants: updated,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  },

  // Delete Group Globally: delete subcollection messages and parent doc
  deleteGroupGlobally: async (chatId) => {
    // 1. Wipe messages subcollection
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const msgsSnap = await getDocs(messagesRef);
    const batch = writeBatch(db);
    msgsSnap.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    // 2. Wipe parent doc
    const roomRef = doc(db, 'chats', chatId);
    await deleteDoc(roomRef);
  }
};
