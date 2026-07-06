import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

export function ChatProvider({ children }) {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);

  // Subscribe to Chats collection where participants array contains currentUser.uid
  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      setChatsLoading(false);
      return;
    }

    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = [];
      snapshot.forEach((docSnap) => {
        chatList.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      // Sort chats in memory based on updatedAt timestamp
      chatList.sort((a, b) => {
        const timeA = a.updatedAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || 0;
        return timeB - timeA;
      });

      setChats(chatList);
      setChatsLoading(false);
    }, (error) => {
      console.error("Error subscribing to chats stream:", error);
      setChatsLoading(false);
    });

    return unsubscribe;
  }, [currentUser]);

  // Subscribe to Messages of the Active Chat
  useEffect(() => {
    if (!activeChat?.chatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chats', activeChat.chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = [];
      snapshot.forEach((docSnap) => {
        msgList.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      setMessages(msgList);
    }, (error) => {
      console.error("Error subscribing to message stream:", error);
    });

    return unsubscribe;
  }, [activeChat]);

  // Auto-update activeChat references if chats list updates (e.g. metadata or lastMessage changes)
  useEffect(() => {
    if (!activeChat) return;
    const updated = chats.find(c => c.id === activeChat.chatId);
    if (updated) {
      setActiveChat(prev => ({
        ...prev,
        ...updated
      }));
    }
  }, [chats]);

  const value = {
    chats,
    activeChat,
    setActiveChat,
    messages,
    chatsLoading
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
