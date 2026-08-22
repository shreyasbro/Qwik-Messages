import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

export function ChatProvider({ children }) {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChatState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);

  // Helper to safely select / persist active chat
  const setActiveChat = (chatOrUpdater) => {
    setActiveChatState((prev) => {
      const nextChat = typeof chatOrUpdater === 'function' ? chatOrUpdater(prev) : chatOrUpdater;
      const targetId = nextChat?.id || nextChat?.chatId || nextChat?.roomId || null;
      if (targetId) {
        sessionStorage.setItem('qwik_active_chat_id', targetId);
      } else {
        sessionStorage.removeItem('qwik_active_chat_id');
      }
      return nextChat;
    });
  };

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

  // Restore active chat from sessionStorage or sync with chats stream updates
  useEffect(() => {
    if (chats.length === 0) return;

    const savedChatId = sessionStorage.getItem('qwik_active_chat_id');
    const currentActiveId = activeChat?.id || activeChat?.chatId || activeChat?.roomId || savedChatId;

    if (currentActiveId) {
      const matchedChat = chats.find(c => (c.id === currentActiveId || c.chatId === currentActiveId || c.roomId === currentActiveId));
      if (matchedChat) {
        setActiveChatState(prev => {
          // If no activeChat is currently set, restore the full matchedChat
          if (!prev) {
            const isGroup = matchedChat.isGroup || matchedChat.type === 'group';
            if (isGroup) {
              return {
                id: matchedChat.id || matchedChat.chatId,
                chatId: matchedChat.id || matchedChat.chatId,
                groupName: matchedChat.groupName,
                groupAvatar: matchedChat.groupAvatar || null,
                groupDescription: matchedChat.groupDescription || '',
                admins: matchedChat.admins || [matchedChat.createdBy],
                onlyAdminsCanMessage: matchedChat.onlyAdminsCanMessage || false,
                participants: matchedChat.participants,
                createdBy: matchedChat.createdBy,
                isGroup: true,
                type: 'group'
              };
            }
            return {
              id: matchedChat.id || matchedChat.chatId,
              chatId: matchedChat.id || matchedChat.chatId,
              participants: matchedChat.participants,
              ...matchedChat
            };
          }
          // Merge recent updates without changing active selection reference unnecessarily
          return {
            ...prev,
            ...matchedChat
          };
        });
      }
    }
  }, [chats]);

  // Subscribe to Messages of the Active Chat
  useEffect(() => {
    const senderId = currentUser?.uid;
    let targetChatId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    
    if (!targetChatId && activeChat?.participants && Array.isArray(activeChat.participants) && senderId) {
      const partnerId = activeChat.participants.find(id => id !== senderId);
      if (partnerId) {
        targetChatId = senderId > partnerId ? `${senderId}_${partnerId}` : `${partnerId}_${senderId}`;
      }
    }

    if (!targetChatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chats', targetChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        return {
          id: docSnap.id,
          ...data,
          timestampMillis: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
        };
      });

      // Deterministic Client-Side Sort Fallback
      fetchedMessages.sort((a, b) => a.timestampMillis - b.timestampMillis);

      setMessages(fetchedMessages);
    }, (error) => {
      console.error("🚨 Error fetching messages:", error);
    });

    return unsubscribe;
  }, [activeChat?.id, activeChat?.chatId, activeChat?.roomId, currentUser?.uid]);

  const [activeMobileTab, setActiveMobileTab] = useState('sidebar');
  const [previewImage, setPreviewImage] = useState(null);

  // Automatically switch tab to chat when activeChat is selected
  useEffect(() => {
    if (activeChat) {
      setActiveMobileTab('chat');
    } else {
      setActiveMobileTab('sidebar');
    }
  }, [activeChat ? (activeChat.id || activeChat.chatId || activeChat.roomId) : null]);

  const value = {
    chats,
    activeChat,
    setActiveChat,
    messages,
    chatsLoading,
    activeMobileTab,
    setActiveMobileTab,
    previewImage,
    setPreviewImage
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
