import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { chatService } from '../../services/chatService';
import { userService } from '../../services/userService';
import DangerZone from './DangerZone';
import { useCall } from '../../context/CallContext';
import { useRecipient } from '../../hooks/useRecipient';
import { safeString } from '../../utils/safeRender';
import MessageBubble from './MessageBubble';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../firebaseConfig';
import { doc, collection, addDoc, setDoc, serverTimestamp, deleteDoc, arrayUnion, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import axios from 'axios';
import JitsiCallRoom from '../JitsiCallRoom';

export default function ChatWindow() {
  const { activeChat, setActiveChat, setPreviewImage } = useChat();
  const { currentUser } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const { initiateCall } = useCall();
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeCall, setActiveCall] = useState({ active: false, type: null }); // type can be 'audio' or 'video'
  const messagesEndRef = useRef(null);
  
  // Media upload features states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsUploading(false);
      setUploadProgress(0);
      console.log("Upload manually canceled by user.");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    const senderId = currentUser?.uid || auth?.currentUser?.uid;
    if (!roomId || !senderId) {
      alert("Please select a chat room first.");
      return;
    }

    const ALLOWED_TYPES = ["video/mp4", "audio/mp3", "audio/mpeg", "image/png", "image/jpeg", "image/jpg", "video/webm"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Unsupported file format!");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setUploadProgress(0);

    try {
      abortControllerRef.current = new AbortController();

      // ⚡ Base Vercel URL mapping config to support local device wrappers (Capacitor)
      const API_BASE_URL = "https://qwik-messages.vercel.app";
      const signRes = await axios.get(`${API_BASE_URL}/api/get-upload-signature`, {
        signal: abortControllerRef.current.signal
      });

      if (!signRes.data.success) {
        throw new Error(signRes.data.error || "Backend returned success: false");
      }
      
      const { signature, timestamp, cloudName, apiKey, folder } = signRes.data;

      // 2. Wrap multi-part data stream packet
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      formData.append("folder", folder);

      // 3. Dispatch asset data directly to Cloudinary core CDN endpoints
      const resourceType = file.type.startsWith("video/") ? "video" : "auto";
      const uploadRes = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: abortControllerRef.current.signal, // ⚡ Attach Abort Signal
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percent);
              console.log(`✨ Upload progress mapping: ${percent}%`);
            }
          }
        }
      );

      const cloudData = uploadRes.data;

      // 4. Record successful payload secure link to Firestore chat history collection
      if (cloudData.secure_url) {
        const messagesRef = collection(db, 'chats', roomId, 'messages');
        await addDoc(messagesRef, {
          senderId: senderId,
          text: `📎 Sent a file: ${file.name}`,
          messageType: "media", // STRICTLY REQUIRED FOR CRON
          mediaUrl: cloudData.secure_url,
          storageProvider: "cloudinary",
          mediaStoragePath: cloudData.public_id,
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
          senderName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
          photoURL: currentUser?.photoURL || null,
          deletedFor: [],
          isEdited: false
        });

        // Atomic Parent Room Update
        const roomRef = doc(db, 'chats', roomId);
        await setDoc(roomRef, {
          id: roomId,
          lastMessage: `📎 Sent a file: ${file.name}`,
          updatedAt: serverTimestamp(),
          participants: activeChat?.participants || [senderId, activeChat?.recipient?.uid].filter(Boolean)
        }, { merge: true });

        console.log("🎉 Asset mapped and delivered into Firestore sub-collection.");
      } else {
        alert("Asset target validation failed at Cloudinary edge nodes.");
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log("Upload manually canceled by user.");
        return;
      }
      console.error("🚨 UPLOAD ERROR:", error);
      
      // Extract the actual error message safely
      let errorMsg = error.message;
      if (error.response && error.response.data) {
        errorMsg = typeof error.response.data === 'object' 
          ? JSON.stringify(error.response.data) 
          : error.response.data;
      }
      
      alert(`Upload Failed: ${errorMsg}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      abortControllerRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 1. CHRONOLOGICAL FETCHING PIPELINE
  useEffect(() => {
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId) {
      setMessages([]);
      return;
    }

    // 1. CRITICAL: Instantly clear old room's messages from UI on room switch!
    setMessages([]);
    setLoading(true);

    const messagesRef = collection(db, 'chats', roomId, 'messages');
    // 2. Strictly sort from oldest (top) to newest (bottom)
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    let timeoutId = null;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map((docSnap) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        return {
          id: docSnap.id,
          ...data,
          timestampMillis: data.createdAt?.toMillis?.() || data.createdAt || Date.now()
        };
      });

      // Double-shield: Enforce strict ascending numeric order
      fetched.sort((a, b) => a.timestampMillis - b.timestampMillis);

      // Force a strict 1.5-second buffer before hiding skeleton to ensure premium visual experience
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setMessages(fetched);
        setLoading(false);
      }, 1500);
    }, (err) => {
      console.error("🚨 Firestore Stream Error:", err);
      setLoading(false);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [activeChat]);

  const { recipient } = useRecipient(activeChat?.participants, currentUser?.uid);
  const recipientName = recipient?.displayName || activeChat?.recipient?.displayName || 'User';
  const avatarSrc = recipient?.photoURL || userService.resolveAvatar(activeChat?.recipient);

  // Filter messages not deleted for current user
  const safeMessages = messages.filter(m => !m.deletedFor?.includes(currentUser?.uid));

  // Deletion permission calculation
  const selectedObjs = safeMessages.filter(m => selectedMessageIds.includes(m.id));
  const canDeleteForEveryone = selectedObjs.length > 0 && selectedObjs.every(msg => msg.senderId === currentUser?.uid);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmedText = inputText.trim();
    if (!trimmedText) return;

    // 1. Resolve Sender strictly
    const senderId = currentUser?.uid || auth?.currentUser?.uid;
    if (!senderId) {
      alert("🚨 Error: You are not authenticated. Please log in again.");
      return;
    }

    // 2. Resolve Chat Room ID strictly with fallback generation
    let targetChatId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    
    if (!targetChatId && activeChat?.participants && Array.isArray(activeChat.participants)) {
      const partnerId = activeChat.participants.find(id => id !== senderId);
      if (partnerId) {
        targetChatId = senderId > partnerId ? `${senderId}_${partnerId}` : `${partnerId}_${senderId}`;
      }
    }

    if (!targetChatId) {
      console.error("🚨 Fatal Send Trap: Missing Room ID for chat object:", activeChat);
      alert("Could not identify this chat room. Please click the contact in the sidebar again.");
      return;
    }

    console.log(`🚀 Attempting to send message to room: [${targetChatId}] as sender: [${senderId}]`);
    setInputText(''); // Optimistic UI clear

    try {
      if (editingMessage) {
        await chatService.editMessage(String(targetChatId), String(editingMessage.id), trimmedText);
        setEditingMessage(null);
      } else {
        // 3. Atomic Subcollection Write
        const messagesRef = collection(db, 'chats', targetChatId, 'messages');
        const msgPayload = {
          text: trimmedText,
          senderId: senderId,
          senderName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
          photoURL: currentUser?.photoURL || null,
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
          deletedFor: [],
          isEdited: false
        };
        if (replyingTo) {
          msgPayload.replyTo = {
            id: String(replyingTo.id),
            text: String(replyingTo.text || ''),
            senderName: String(replyingTo.senderId === senderId ? 'Me' : (recipientName || 'User'))
          };
        }
        await addDoc(messagesRef, msgPayload);

        // 4. Atomic Parent Room Update (Using setDoc merge to prevent 'No document to update' errors)
        const roomRef = doc(db, 'chats', targetChatId);
        await setDoc(roomRef, {
          id: targetChatId,
          lastMessage: trimmedText,
          updatedAt: serverTimestamp(),
          participants: activeChat?.participants || [senderId, activeChat?.recipient?.uid].filter(Boolean)
        }, { merge: true });

        setReplyingTo(null);
      }

      console.log("✅ Message successfully written to Firestore!");
    } catch (err) {
      console.error("🚨 Firebase Write Error:", err);
      alert(`Failed to send message: ${err.message}`);
      setInputText(trimmedText); // Restore input text on failure
    }
  };

  const handleStartEdit = (message) => {
    setEditingMessage(message);
    setInputText(message.text || '');
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleStartReply = (message) => {
    setReplyingTo(message);
    setEditingMessage(null);
    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleDeleteForMe = async (messageId) => {
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId) return;
    try {
      const currentUserId = String(currentUser?.uid || '');
      const msgRef = doc(db, 'chats', roomId, 'messages', messageId);
      await setDoc(msgRef, {
        deletedFor: arrayUnion(currentUserId)
      }, { merge: true });
    } catch (err) {
      console.error("Delete for me failed:", err);
      alert(`Failed to delete message: ${err.message}`);
    }
  };

  const handleDeleteForEveryone = async (messageId) => {
    if (!window.confirm("Wipe this message from everyone's screens?")) return;
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId) return;
    try {
      const msgRef = doc(db, 'chats', roomId, 'messages', messageId);
      await deleteDoc(msgRef);

      // Rollback lastMessage if deleted message was the latest
      const messagesRef = collection(db, 'chats', roomId, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
      const snapshot = await getDocs(q);

      let newLastMessage = null;
      let newLastMessageTime = null;

      if (!snapshot.empty) {
        const msgData = snapshot.docs[0].data();
        newLastMessage = msgData.text || (msgData.mediaUrl ? '📁 Attachment' : '');
        newLastMessageTime = msgData.createdAt || null;
      }

      await setDoc(doc(db, 'chats', roomId), {
        lastMessage: newLastMessage,
        lastMessageTime: newLastMessageTime,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error("Delete for everyone failed:", err);
      alert(`Failed to delete message for everyone: ${err.message}`);
    }
  };

  // Bulk Actions
  const handleStartSelectMode = (msgId) => {
    setIsSelectMode(true);
    setSelectedMessageIds([msgId]);
    setShowEmojiPicker(false);
  };

  const handleSelectToggle = (msgId) => {
    setSelectedMessageIds(prev => 
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const handleBulkDeleteForMe = async () => {
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId || !selectedMessageIds.length) return;
    try {
      const currentUserId = String(currentUser?.uid || '');
      await Promise.all(selectedMessageIds.map(msgId => {
        const msgRef = doc(db, 'chats', roomId, 'messages', msgId);
        return setDoc(msgRef, {
          deletedFor: arrayUnion(currentUserId)
        }, { merge: true });
      }));
      setIsSelectMode(false);
      setSelectedMessageIds([]);
    } catch (err) {
      console.error("Bulk delete for me failed:", err);
      alert(`Failed to bulk delete messages: ${err.message}`);
    }
  };

  const handleBulkDeleteForEveryone = async () => {
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId || !selectedMessageIds.length) return;
    if (!window.confirm(`Wipe ${selectedMessageIds.length} messages for everyone?`)) return;

    try {
      await Promise.all(
        selectedMessageIds.map((msgId) => {
          const msgRef = doc(db, 'chats', roomId, 'messages', msgId);
          return deleteDoc(msgRef);
        })
      );
      setSelectedMessageIds([]);
      setIsSelectMode(false);
    } catch (err) {
      console.error("🚨 Bulk Delete Error:", err);
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChat?.id]);

  // Turn off select mode when switching chats
  useEffect(() => {
    setIsSelectMode(false);
    setSelectedMessageIds([]);
    setShowEmojiPicker(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setInputText('');
  }, [activeChat]);

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0B1120] relative overflow-hidden h-full select-none">
        {/* Abstract Background Glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col items-center text-center p-8 animate-fade-in-up">
          <div className="w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-2xl shadow-teal-500/10 rounded-3xl flex items-center justify-center mb-6 transform transition-transform hover:scale-105 duration-300">
            <svg className="w-10 h-10 text-teal-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
              <path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight mb-2">
            Your Secure Workspace
          </h2>
          <p className="text-slate-400 text-sm max-w-xs leading-relaxed font-medium">
            Select a contact from the sidebar or initiate a new secure channel to start collaborating.
          </p>
        </div>
      </div>
    );
  }

  const formatTimeSafe = (timestamp) => {
    if (!timestamp) return '';
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="flex-grow h-full flex bg-[#020617] overflow-hidden overflow-x-hidden relative">
      
      {/* Primary Message Feed Window */}
      <div className="flex-1 h-full flex flex-col min-w-0 relative">
        
        {/* Chat Window Header */}
        {/* Chat Window Custom Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-900 bg-[#0B111E] z-10 select-none">
          
          {/* CLICKABLE RECIPIENT PROFILE TRIGGER */}
          <div 
            onClick={() => setShowInfoPanel(true)}
            className="flex items-center gap-3 cursor-pointer group p-1.5 rounded-xl hover:bg-slate-800/40 transition-all select-none min-w-0"
            title="Click to view user info"
          >
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                setActiveChat(null); 
              }}
              className="md:hidden text-slate-300 hover:text-white mr-1 text-lg font-bold p-1 rounded hover:bg-slate-800"
            >
              ←
            </button>
            
            <div className="relative">
              <img 
                src={avatarSrc} 
                alt={safeString(recipientName)} 
                title="View profile picture"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(avatarSrc);
                }}
                className="w-10 h-10 rounded-full object-cover border border-slate-800 group-hover:border-teal-500 transition-colors cursor-pointer hover:scale-105 transition-transform" 
              />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-black text-white group-hover:text-teal-400 transition-colors truncate">
                {safeString(recipientName, 'Chat Member')}
              </h3>
              <p className="text-[10px] text-slate-300 font-medium truncate">
                Direct Secure Connection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            {/* AUDIO CALL BUTTON */}
            <button 
              onClick={() => setActiveCall({ active: true, type: 'audio' })}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Voice Call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>

            {/* VIDEO CALL BUTTON */}
            <button 
              onClick={() => setActiveCall({ active: true, type: 'video' })}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-cyan-400 hover:bg-slate-800 hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Video Call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </button>
          </div>
        </div>

        {/* Floating Select Mode Bar */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-20 left-4 right-4 bg-slate-900/95 backdrop-blur-xl border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between shadow-2xl z-20 select-none"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-white bg-slate-850 px-3 py-1.5 rounded-full border border-slate-700/60">
                  {selectedMessageIds.length} Selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedMessageIds([]);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-300 hover:text-white font-bold transition-colors bg-slate-800 hover:bg-slate-700/80 rounded-lg cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBulkDeleteForMe}
                  className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 font-bold transition-colors bg-rose-950/10 hover:bg-rose-950/20 border border-rose-950/50 rounded-lg cursor-pointer"
                >
                  Delete for Me
                </motion.button>
                {canDeleteForEveryone && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleBulkDeleteForEveryone}
                    className="px-3 py-1.5 text-xs text-rose-500 hover:text-rose-400 font-black transition-colors bg-rose-950/30 hover:bg-rose-950/40 border border-rose-950/80 rounded-lg cursor-pointer"
                  >
                    Delete for All
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Message Bubble Logs List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 sm:px-5 py-4 space-y-3 relative bg-slate-950/40 flex flex-col">
          <AnimatePresence initial={false}>
            {loading && safeMessages.length === 0 ? (
              /* 🟢 IF LOADING AND NO MESSAGES YET: SHOW SKELETON */
              <div className="flex-1 overflow-hidden p-6 space-y-6 animate-fade-in select-none">
                {[...Array(6)].map((_, index) => {
                  const isSender = index % 2 === 0;
                  return (
                    <div key={index} className={`flex ${isSender ? "justify-end" : "justify-start"}`}>
                      <div className="flex items-end gap-2.5 max-w-[75%]">
                        <div className="flex flex-col gap-1.5">
                          <div 
                            className={`p-3.5 rounded-2xl border ${isSender ? "bg-teal-500/10 border-teal-500/50 rounded-br-sm" : "bg-slate-800/80 border-slate-700/60 rounded-tl-sm"}`}
                          >
                            <div className={`h-2.5 rounded-full ${isSender ? "bg-teal-400/70" : "bg-slate-600"} ${index % 3 === 0 ? "w-24" : "w-40"} animate-pulse mb-2`}></div>
                            <div className={`h-2.5 rounded-full ${isSender ? "bg-teal-400/50" : "bg-slate-700"} w-48 animate-pulse`}></div>
                          </div>
                          <div className={`h-2 w-10 bg-slate-800 rounded-full animate-pulse ${isSender ? "self-end" : "self-start"}`}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : safeMessages.length > 0 ? (
              /* 🔵 SHOW MESSAGES */
              (() => {
                const getWhatsAppDateLabel = (timestampMillis) => {
                  const validMillis = timestampMillis || Date.now();
                  const msgDate = new Date(validMillis);
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);

                  if (msgDate.toDateString() === today.toDateString()) {
                    return 'Today';
                  }
                  if (msgDate.toDateString() === yesterday.toDateString()) {
                    return 'Yesterday';
                  }
                  
                  return msgDate.toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  });
                };

                return safeMessages.map((m, index) => {
                  const currentLabel = getWhatsAppDateLabel(m.timestampMillis);
                  const prevLabel = index > 0 ? getWhatsAppDateLabel(safeMessages[index - 1].timestampMillis) : null;
                  const showDateHeader = currentLabel !== prevLabel;

                  return (
                    <React.Fragment key={m.id || m.timestampMillis || index}>
                      {showDateHeader && (
                        <div className="flex justify-center my-3 select-none animate-fade-in z-10">
                          <span className="bg-[#1e293b]/95 text-slate-200 text-[11px] font-bold px-4 py-1 rounded-full border border-slate-700/80 shadow-md tracking-wider uppercase">
                            {currentLabel}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={m}
                        currentUser={currentUser}
                        onReply={handleStartReply}
                        onEdit={handleStartEdit}
                        onDeleteForMe={handleDeleteForMe}
                        onDeleteForEveryone={handleDeleteForEveryone}
                        formatTimeSafe={formatTimeSafe}
                        isSelectMode={isSelectMode}
                        isSelected={selectedMessageIds.includes(m.id)}
                        onSelectToggle={handleSelectToggle}
                        onStartSelectMode={handleStartSelectMode}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : (
              /* ⚪ IF DONE & NO MESSAGES: EXCLUSIVELY SHOW EMPTY STATE */
              <div className="text-center py-20 animate-fade-in">
                <span className="text-4xl block mb-2 animate-bounce">👋</span>
                <p className="text-sm text-slate-300 font-medium">Say hi to your new friend! 👋</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">Send a message to {recipientName} to begin chatting.</p>
              </div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Reply/Edit Active Display Indicator & Footer Input Bar */}
        <div className="border-t border-slate-900 bg-[#0B111E] z-10 relative">
          {isUploading && (
            <div className="absolute bottom-full left-0 mb-2 ml-4 flex items-center gap-3 p-2.5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 w-auto min-w-[220px] animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Loading Indicator & Text */}
              <div className="flex flex-col flex-1">
                <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">UPLOADING MEDIA...</span>
                <span className="text-xs text-teal-400 font-bold mt-0.5">{uploadProgress}%</span>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
                  <div 
                    className="bg-teal-500 h-1 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
              
              {/* THE GUARANTEED 'X' CANCEL BUTTON */}
              <button
                type="button"
                onClick={cancelUpload}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all cursor-pointer flex-shrink-0"
                title="Cancel Upload"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          )}
          {replyingTo && (
            <div className="px-4 py-2 flex items-center justify-between bg-slate-900/60 border-b border-slate-800 text-xs">
              <div className="border-l-2 border-emerald-400 pl-2 min-w-0">
                <p className="font-bold text-emerald-400 text-[10px]">
                  Replying to {replyingTo.senderId === currentUser.uid ? 'Self' : (recipientName || 'User')}
                </p>
                <p className="text-slate-300 truncate">{replyingTo.text}</p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white px-2 font-bold cursor-pointer">✕</button>
            </div>
          )}
          {editingMessage && (
            <div className="px-4 py-2 flex items-center justify-between bg-slate-900/60 border-b border-slate-800 text-xs">
              <div className="border-l-2 border-amber-400 pl-2 min-w-0">
                <p className="font-bold text-amber-400 text-[10px]">Editing Message</p>
                <p className="text-slate-300 truncate">{editingMessage.text}</p>
              </div>
              <button onClick={() => { setEditingMessage(null); setInputText(''); }} className="text-slate-400 hover:text-white px-2 font-bold cursor-pointer">✕</button>
            </div>
          )}

          <div className="flex items-center gap-1.5 w-full px-2 py-2.5 sm:px-4 bg-[#0B111E] border-t border-slate-900/60 box-border">
            {/* Attachment Clip */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".mp4,.mp3,.png,.jpg,.jpeg,.webm" 
              className="hidden" 
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`w-9 h-9 rounded-full border flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer text-xs flex-shrink-0 ${
                isUploading ? "bg-teal-950/20 border-teal-500 text-teal-400 animate-pulse" : "bg-slate-900/60 border-slate-800"
              }`}
              title="Add Attachment"
            >
              {isUploading ? "⏳" : "📎"}
            </button>

            {/* Emoji Trigger */}
            <div className="relative flex items-center flex-shrink-0">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-9 h-9 bg-slate-900/60 border border-slate-800 rounded-full flex items-center justify-center hover:text-amber-400 transition-colors text-xs cursor-pointer"
                title="Select Emoji"
              >
                😀
              </motion.button>
              {showEmojiPicker && (
                <div className="absolute bottom-14 left-0 z-50 shadow-2xl rounded-3xl overflow-hidden border border-slate-800">
                  <EmojiPicker 
                    theme={Theme.DARK} 
                    emojiStyle={EmojiStyle.GOOGLE}
                    onEmojiClick={(emojiData) => {
                      setInputText((prev) => prev + emojiData.emoji);
                      setShowEmojiPicker(false);
                    }}
                    lazyLoadEmojis={true}
                  />
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex-1 flex gap-1.5 items-center min-w-0">
              <input
                type="text"
                placeholder={isUploading ? "Uploading file..." : (editingMessage ? "Edit your message..." : "Type your message...")}
                disabled={isUploading}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                }}
                className="flex-1 min-w-0 bg-slate-900/60 border border-slate-800/80 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:border-teal-500 transition-all placeholder-slate-500 shadow-inner disabled:opacity-60 disabled:cursor-not-allowed"
              />
              
              {/* Actions Group - Mic & Send Button */}
              <div className="flex items-center gap-1.5 flex-shrink-0 pl-1 pr-1 sm:pr-0">
                {/* Mic / Voice Note */}
                <button 
                  type="button"
                  onClick={() => alert("🎤 Voice messaging feature is coming soon!")}
                  className="w-9 h-9 rounded-full bg-slate-900/60 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer text-xs"
                  title="Record Voice Note"
                >
                  🎤
                </button>

                <button
                  type="submit"
                  className="bg-teal-500 hover:bg-teal-400 text-slate-950 p-2 rounded-full transition-all flex items-center justify-center shadow-lg shadow-teal-500/20 active:scale-95 cursor-pointer w-9 h-9"
                  title={editingMessage ? 'Save Message' : 'Send Message'}
                >
                  <svg 
                    className="w-4 h-4 transform rotate-45 -translate-x-0.5" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth="2.5" 
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    ></path>
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* Right Drawer Info Panel */}
      {showInfoPanel && (
        <div className="w-[300px] border-l border-slate-900 bg-[#0B111E] h-full flex flex-col p-6 overflow-y-auto custom-scrollbar flex-shrink-0 animate-fade-in z-10 select-none">
          
          {/* Drawer Header with Close Button */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-900 mb-6">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">User Info</h2>
            
            {/* '✕' CLOSE BUTTON */}
            <button 
              type="button"
              onClick={() => setShowInfoPanel(false)}
              title="Close Info"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="text-center mb-6 border-b border-slate-900 pb-6">
            <img 
              src={avatarSrc} 
              alt={safeString(recipientName)} 
              title="View profile picture"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(avatarSrc);
              }}
              className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-emerald-500/20 shadow-lg mb-3 cursor-pointer hover:scale-105 transition-transform" 
            />
            <h4 className="text-white font-black text-lg">{safeString(recipientName, 'Chat Member')}</h4>
            <p className="text-xs text-slate-300 truncate font-semibold">{safeString(recipient?.email || activeChat.recipient?.email, 'No email synced')}</p>
          </div>

          <div className="flex-1">
            {/* ABOUT & ACTIVITY SECTION (Replaces old Connection Metadata) */}
            <div className="space-y-2 mb-6 w-full text-left">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 pl-1">About & Activity</h3>
              
              <div className="bg-slate-900/60 border border-slate-800/60 p-4 rounded-2xl flex flex-col gap-4">
                
                {/* User Bio / About */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bio</p>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">
                    {recipient?.bio || "Hey there! I am using Qwik Messages."}
                  </p>
                </div>

                {/* Subtle Divider */}
                <div className="h-px w-full bg-slate-800/50"></div>

                {/* Last Active Status */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Last Active</p>
                  <div className="flex items-center gap-2.5">
                    {recipient?.status === 'ONLINE' || recipient?.isOnline ? (
                      <>
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                        </span>
                        <span className="text-sm font-bold text-teal-400">Online Now</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-600 shrink-0"></span>
                        <span className="text-sm font-medium text-slate-400">
                          {recipient?.lastActive ? `Last seen ${recipient.lastActive}` : "Last seen recently"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Danger Zone */}
            <DangerZone isGroup={activeChat.type === 'group'} creatorId={activeChat.creatorId} />
          </div>
        </div>
      )}
      
      {activeCall.active && (
        <JitsiCallRoom 
          roomName={`qwik-messages-room-${activeChat?.id || activeChat?.chatId || activeChat?.roomId || 'global'}`}
          userName={currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'}
          isVideoCall={activeCall.type === 'video'}
          onLeave={() => setActiveCall({ active: false, type: null })}
        />
      )}
    </div>
  );
}
