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
import PresenceBadge from '../profile/PresenceBadge';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../../firebaseConfig';
import { doc, collection, addDoc, setDoc, serverTimestamp, deleteDoc, updateDoc, arrayUnion, arrayRemove, query, orderBy, limit, getDocs, onSnapshot, deleteField } from 'firebase/firestore';
import axios from 'axios';
import JitsiCallRoom from '../JitsiCallRoom';
import UserSearchModal from './UserSearchModal';
import AddToGroupModal from './AddToGroupModal';
import CreatePollModal from './CreatePollModal';
import ChatToast from '../ChatToast';

export default function ChatWindow() {
  const { activeChat, setActiveChat, setPreviewImage } = useChat();
  const { currentUser, userProfile: currentUserProfile } = useAuth();

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [mediaTab, setMediaTab] = useState('photos'); // 'photos' | 'videos' | 'docs'
  const [allMediaItems, setAllMediaItems] = useState({ photos: [], videos: [], docs: [] });
  const [toastMessage, setToastMessage] = useState(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const lastTypingHeartbeatRef = useRef(0);
  const toastTimeoutRef = useRef(null);
  const attachMenuRef = useRef(null);

  const showToast = (msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const typingTimeoutRef = useRef(null);

  // Helper: Emit Typing to Firestore (supports both boolean & timestamp)
  const handleInputChange = async (e) => {
    const textVal = e.target.value;
    setInputText(textVal);

    const currentUid = currentUser?.uid || currentUser?.id;
    const targetRoomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!targetRoomId || !currentUid) return;

    try {
      const chatDocRef = doc(db, 'chats', targetRoomId);
      await setDoc(
        chatDocRef,
        {
          typingUsers: {
            [currentUid]: true, // Boolean true for instant universal compatibility
          },
        },
        { merge: true }
      );

      // Reset after 1 second (1000ms) of inactivity
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(async () => {
        try {
          await setDoc(
            chatDocRef,
            {
              typingUsers: {
                [currentUid]: false,
              },
            },
            { merge: true }
          );
        } catch (e) {}
      }, 1000);
    } catch (err) {
      console.warn('[TypingSync] Could not emit typing:', err.message);
    }
  };

  const clearTypingImmediately = async () => {
    const currentUid = currentUser?.uid || currentUser?.id;
    const targetRoomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!targetRoomId || !currentUid) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    try {
      const chatDocRef = doc(db, 'chats', targetRoomId);
      await setDoc(
        chatDocRef,
        {
          typingUsers: {
            [currentUid]: false,
          },
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[TypingSync] Clear typing error:', err.message);
    }
  };
  const [activeCall, setActiveCall] = useState({ active: false, type: null }); // type can be 'audio' or 'video'
  const [isGroupSearchOpen, setIsGroupSearchOpen] = useState(false);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Touch engine internal state refs
  const touchState = useRef({
    startY: 0,
    lastY: 0,
    startTime: 0,
    velocity: 0,
    isDragging: false,
    animFrame: null
  });
  
  // Media upload features states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const uploadXhrRef = useRef(null);

  const cancelUpload = () => {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    console.log("Upload manually canceled by user.");
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const uploadMediaDirect = (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr; // Store active XHR reference

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'Media Sending');

      xhr.open('POST', 'https://api.cloudinary.com/v1_1/dphkrk4sf/auto/upload', true);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        uploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res);
          } catch (err) {
            reject(new Error('Invalid Cloudinary response format'));
          }
        } else {
          console.error('Cloudinary upload error payload:', xhr.responseText);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onabort = () => {
        uploadXhrRef.current = null;
        reject(new Error('UPLOAD_ABORTED'));
      };

      xhr.onerror = () => {
        uploadXhrRef.current = null;
        reject(new Error('Network error during media upload'));
      };

      xhr.send(formData);
    });
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

    const fileExt = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ["mp4", "mp3", "mpeg", "png", "jpg", "jpeg", "webm", "pdf", "doc", "docx", "txt"];
    if (!allowedExtensions.includes(fileExt)) {
      alert("Unsupported file format!");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const cloudData = await uploadMediaDirect(file, (progress) => {
        setUploadProgress(progress);
      });

      if (cloudData.secure_url) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const isDocument = ['pdf', 'doc', 'docx', 'txt'].includes(fileExt);

        const messagesRef = collection(db, 'chats', roomId, 'messages');
        await addDoc(messagesRef, {
          senderId: senderId,
          text: `📎 Sent a file: ${file.name}`,
          messageType: "media", // STRICTLY REQUIRED FOR CRON
          type: isDocument ? "document" : (isImage ? "image" : (isVideo ? "video" : "audio")),
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          fileExt: fileExt,
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
    } catch (err) {
      if (err.message === 'UPLOAD_ABORTED') {
        console.log('User cancelled the upload.');
        return;
      }
      console.error("Direct upload error:", err);
      alert("Upload Failed: " + (err.message || "Please check network connection"));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 1. CHRONOLOGICAL FETCHING PIPELINE
  const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;

  useEffect(() => {
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
  }, [roomId]);

  // Real-time listener for chat document (pinned messages, universal typing status & metadata)
  useEffect(() => {
    const currentUid = currentUser?.uid || currentUser?.id;
    if (!roomId || !currentUid) {
      setPinnedMessage(null);
      setIsOtherUserTyping(false);
      return;
    }

    const chatDocRef = doc(db, 'chats', roomId);
    const unsubscribe = onSnapshot(
      chatDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPinnedMessage(data.pinnedMessage || null);

          const typingMap = data.typingUsers || {};
          const now = Date.now();

          // Check if any other user is currently typing
          const isOtherTyping = Object.entries(typingMap).some(([uid, val]) => {
            if (uid === currentUid || !val) return false;
            
            // Direct boolean true check
            if (val === true) return true;
            
            // 1-second timestamp fallback threshold
            const numVal = Number(val);
            if (!isNaN(numVal) && numVal > 0) {
              return (now - numVal) <= 1200;
            }

            return false;
          });

          setIsOtherUserTyping(isOtherTyping);
        } else {
          setPinnedMessage(null);
          setIsOtherUserTyping(false);
        }
      },
      (err) => {
        console.warn('[TypingSync] Snapshot listener warning:', err.message);
      }
    );

    return () => {
      unsubscribe();
      clearTypingImmediately();
    };
  }, [roomId, currentUser]);

  // Robust Unpin Handler with Optimistic UI Update and deleteField
  const handleUnpinMessage = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!roomId) return;

    // 1. Instant Optimistic UI Clear
    setPinnedMessage(null);

    try {
      const chatDocRef = doc(db, 'chats', roomId);
      // 2. Completely remove the pinnedMessage field from Firestore
      await updateDoc(chatDocRef, {
        pinnedMessage: deleteField()
      });

      showToast('Message unpinned 📌');
    } catch (err) {
      console.error('Error unpinning message:', err);
      // Fallback: try setting to null if deleteField fails
      try {
        const chatDocRef = doc(db, 'chats', roomId);
        await updateDoc(chatDocRef, { pinnedMessage: null });
        showToast('Message unpinned 📌');
      } catch (fallbackErr) {
        console.error('Fallback unpin failed:', fallbackErr);
      }
    }
  };

  // Helper: Extract valid media URL from any legacy/new message schema
  const getValidMediaUrl = (msg) => {
    return msg.mediaUrl || msg.imageUrl || msg.fileUrl || msg.url || msg.attachment || null;
  };

  // Helper: Detect file extension from URL or fileName
  const detectFileExtension = (msg, mediaUrl) => {
    if (msg.fileExt) return msg.fileExt.toLowerCase();
    if (msg.fileName && msg.fileName.includes('.')) {
      return msg.fileName.split('.').pop().toLowerCase();
    }
    if (typeof mediaUrl === 'string') {
      const cleanUrl = mediaUrl.split('?')[0];
      const parts = cleanUrl.split('.');
      if (parts.length > 1) {
        return parts.pop().toLowerCase();
      }
    }
    return '';
  };

  // Real-time comprehensive historical media query (without strict Firestore orderBy to catch all legacy docs)
  useEffect(() => {
    if (!roomId) {
      setAllMediaItems({ photos: [], videos: [], docs: [] });
      return;
    }

    const messagesRef = collection(db, 'chats', roomId, 'messages');

    const unsubscribe = onSnapshot(messagesRef, (snapshot) => {
      const rawMessages = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // Client-side Safe Sort (Newest First)
      rawMessages.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      const photos = [];
      const videos = [];
      const docs = [];

      rawMessages.forEach((msg) => {
        if (msg.isDeleted) return; // Skip deleted items

        const mediaUrl = getValidMediaUrl(msg);
        if (!mediaUrl) return; // Skip pure text messages

        const ext = detectFileExtension(msg, mediaUrl);
        const msgType = (msg.type || '').toLowerCase();

        const itemPayload = {
          id: msg.id,
          mediaUrl: mediaUrl,
          fileName: msg.fileName || `File_${msg.id.slice(0, 5)}.${ext || 'dat'}`,
          fileSize: msg.fileSize || 'Media',
          fileExt: ext,
          createdAt: msg.createdAt,
        };

        // 1. Photos Matching
        if (
          msgType === 'image' ||
          msgType === 'photo' ||
          ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
          (typeof mediaUrl === 'string' && mediaUrl.includes('/image/upload/'))
        ) {
          photos.push(itemPayload);
        }
        // 2. Videos Matching
        else if (
          msgType === 'video' ||
          ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext) ||
          (typeof mediaUrl === 'string' && mediaUrl.includes('/video/upload/'))
        ) {
          videos.push(itemPayload);
        }
        // 3. Documents Matching
        else if (
          msgType === 'document' ||
          msgType === 'doc' ||
          msgType === 'file' ||
          ['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', 'csv'].includes(ext) ||
          (typeof mediaUrl === 'string' && mediaUrl.includes('/raw/upload/'))
        ) {
          docs.push(itemPayload);
        }
      });

      setAllMediaItems({ photos, videos, docs });
    }, (err) => {
      console.warn("Historical media query error:", err);
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    setNewGroupDesc(activeChat?.groupDescription || '');
    setIsEditingDesc(false);
  }, [activeChat?.groupDescription, activeChat?.id]);

  useEffect(() => {
    const roomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
    if (!roomId || !messages || messages.length === 0 || !currentUser?.uid) return;

    const unread = messages.filter(
      (m) => m.senderId !== currentUser.uid && m.status !== 'read'
    );

    if (unread.length === 0) return;

    unread.forEach(async (m) => {
      try {
        const msgRef = doc(db, 'chats', roomId, 'messages', m.id);
        if (m.senderId !== currentUser.uid) {
          await setDoc(msgRef, { status: 'read' }, { merge: true });
        }
      } catch (err) {
        console.error("Error updating read receipt status:", err);
      }
    });
  }, [messages, activeChat, currentUser?.uid]);

  useEffect(() => {
    setNewGroupName(activeChat?.groupName || '');
    setIsEditingName(false);
  }, [activeChat?.groupName, activeChat?.id]);

  const isGroupChat = activeChat?.isGroup || activeChat?.type === 'group';

  const [resolvedMembers, setResolvedMembers] = useState({});

  useEffect(() => {
    if (!activeChat || !activeChat.participants || !isGroupChat) {
      setResolvedMembers({});
      return;
    }
    const fetchMembers = async () => {
      try {
        const users = await userService.getAllUsers();
        const mapping = {};
        users.forEach(u => {
          if (activeChat.participants.includes(u.uid)) {
            mapping[u.uid] = {
              displayName: u.displayName || u.email?.split('@')[0] || 'User',
              photoURL: u.photoURL || userService.resolveAvatar(u),
              email: u.email
            };
          }
        });
        setResolvedMembers(mapping);
      } catch (err) {
        console.error("Error resolving group profiles:", err);
      }
    };
    fetchMembers();
  }, [activeChat, activeChat?.participants]);

  const { recipient } = useRecipient(isGroupChat ? [] : activeChat?.participants, currentUser?.uid);
  
  const recipientName = isGroupChat 
    ? (activeChat.groupName || 'Group Chat') 
    : (recipient?.displayName || activeChat?.recipient?.displayName || 'User');
    
  const avatarSrc = isGroupChat 
    ? (activeChat.groupAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(recipientName)}&background=0d9488&color=fff&bold=true`) 
    : (recipient?.photoURL || userService.resolveAvatar(activeChat?.recipient));

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
          isEdited: false,
          status: 'sent'
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

      await clearTypingImmediately();
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

  // 🔥 DIRECT HARDWARE TOUCH-SCROLL ENGINE
  const handleTouchStart = (e) => {
    const el = scrollContainerRef.current;
    if (!el || e.touches.length !== 1) return;

    if (touchState.current.animFrame) {
      cancelAnimationFrame(touchState.current.animFrame);
    }

    const touch = e.touches[0];
    touchState.current = {
      startY: touch.clientY,
      lastY: touch.clientY,
      startTime: Date.now(),
      velocity: 0,
      isDragging: true,
      animFrame: null
    };
  };

  const handleTouchMove = (e) => {
    const el = scrollContainerRef.current;
    if (!el || !touchState.current.isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const currentY = touch.clientY;
    const deltaY = touchState.current.lastY - currentY;
    const now = Date.now();
    const timeDelta = now - touchState.current.startTime || 1;

    // Direct mathematical scroll manipulation
    el.scrollTop += deltaY;

    // Track instant velocity for inertia release
    touchState.current.velocity = deltaY / timeDelta;
    touchState.current.lastY = currentY;
    touchState.current.startTime = now;
  };

  const handleTouchEnd = () => {
    const el = scrollContainerRef.current;
    if (!el || !touchState.current.isDragging) return;

    touchState.current.isDragging = false;
    let velocity = touchState.current.velocity * 18; // Inertia boost

    // Kinetic Decay Animation (Inertia Momentum)
    const decay = () => {
      if (Math.abs(velocity) < 0.1) return;
      el.scrollTop += velocity;
      velocity *= 0.92; // Friction factor
      touchState.current.animFrame = requestAnimationFrame(decay);
    };

    if (Math.abs(velocity) > 0.5) {
      touchState.current.animFrame = requestAnimationFrame(decay);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChat?.id]);

  // Close attachment & emoji menu on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Turn off select mode when switching chats
  useEffect(() => {
    setIsSelectMode(false);
    setSelectedMessageIds([]);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setInputText('');
  }, [roomId]);

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
            
            <div className="relative w-10 h-10 shrink-0">
              <img 
                src={avatarSrc} 
                alt={safeString(recipientName)} 
                title="View profile picture"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(avatarSrc);
                }}
                className="w-full h-full rounded-full object-cover border border-slate-800 group-hover:border-teal-500 transition-colors cursor-pointer hover:scale-105 transition-transform" 
              />
              {!isGroupChat && (
                <PresenceBadge status={recipient?.presenceStatus || (recipient?.isOnline ? 'online' : 'idle')} className="absolute bottom-0.5 right-0.5 z-10" size="w-2.5 h-2.5" />
              )}
            </div>

            <div className="min-w-0 text-left">
              <h3 className="text-sm font-black text-white group-hover:text-teal-400 transition-colors truncate">
                {safeString(recipientName, 'Chat Member')}
              </h3>
              {isOtherUserTyping ? (
                <div className="flex items-center gap-1.5 text-xs text-teal-400 font-semibold animate-pulse">
                  <span>typing</span>
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 bg-teal-400 rounded-full animate-bounce"></span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-300 font-medium truncate">
                  {isGroupChat 
                    ? `${activeChat.participants?.length || 0} members` 
                    : "Direct Secure Connection"}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            {/* AUDIO CALL BUTTON */}
            <button 
              onClick={() => {
                console.log("☎️ Initiating Audio Call for:", activeChat);
                initiateCall(activeChat, 'audio');
              }}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Voice Call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>

            {/* VIDEO CALL BUTTON */}
            <button 
              onClick={() => {
                console.log("📹 Initiating Video Call for:", activeChat);
                initiateCall(activeChat, 'video');
              }}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-cyan-400 hover:bg-slate-800 hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-center"
              title="Video Call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </button>

            {/* ADD MEMBER BUTTON */}
            {!isGroupChat && (
              <button 
                onClick={() => setShowAddToGroupModal(true)}
                className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title="Add to a Group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* PINNED MESSAGE BANNER */}
        {pinnedMessage && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/95 border-b border-teal-500/20 backdrop-blur-md z-20 animate-in fade-in slide-in-from-top-2 duration-150 shadow-md select-none">
            {/* Pinned Text Preview */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
              <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </div>
              <div className="text-xs truncate">
                <span className="font-bold text-teal-400 mr-1.5">Pinned:</span>
                <span className="text-gray-200">{pinnedMessage.text || 'Message'}</span>
              </div>
            </div>

            {/* Close / Unpin Button */}
            <button
              type="button"
              onClick={handleUnpinMessage}
              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
              title="Unpin Message"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

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

        {/* 2. DEDICATED SCROLLABLE MESSAGES VIEWPORT */}
        <main className="flex-1 min-h-0 relative w-full overflow-hidden">
          <div 
            ref={scrollContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="chat-scroll-engine px-3 sm:px-5 py-4 space-y-3 relative bg-slate-950/40 flex flex-col h-full" 
            id="chat-messages-container"
          >
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
                        <div className="message-bubble-item w-full">
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
                            isGroup={isGroupChat}
                            chatId={activeChat?.id || activeChat?.chatId || activeChat?.roomId}
                            onShowToast={showToast}
                          />
                        </div>
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
            <div ref={messagesEndRef} className="h-2 flex-shrink-0" />
          </div>
        </main>

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

          {/* CONDITIONAL MESSAGE INPUT COMPONENT */}
          {(() => {
            const hasBlocked = currentUserProfile?.blockedUsers?.includes(recipient?.uid);
            const amIBlocked = recipient?.blockedUsers?.includes(currentUser?.uid);

            if (amIBlocked) {
              return (
                <div className="p-4 bg-[#0B111E] border-t border-slate-900/60 w-full text-center">
                  <div className="text-xs font-semibold text-slate-400 bg-slate-950/40 border border-slate-900 p-3.5 rounded-xl italic">
                    {recipientName || "This user"} has blocked you.
                  </div>
                </div>
              );
            }

            if (hasBlocked) {
              return (
                <div className="p-4 bg-[#0B111E] border-t border-slate-900/60 w-full text-center">
                  <div className="text-xs font-semibold text-slate-400 bg-slate-950/40 border border-slate-900 p-3.5 rounded-xl">
                    You blocked this user.{" "}
                    <button 
                      onClick={async () => {
                        try {
                          const currentUserRef = doc(db, "users", currentUser.uid);
                          await setDoc(currentUserRef, {
                            blockedUsers: arrayRemove(recipient.uid)
                          }, { merge: true });
                          console.log("Unblocked user:", recipient.uid);
                        } catch (err) {
                          console.error("Unblock failed:", err);
                        }
                      }}
                      className="text-teal-400 hover:text-teal-300 font-bold underline cursor-pointer ml-1"
                    >
                      Unblock to send messages.
                    </button>
                  </div>
                </div>
              );
            }

            if (isGroupChat && activeChat.onlyAdminsCanMessage && !(activeChat.admins || []).includes(currentUser.uid)) {
              return (
                <div className="w-full p-4 bg-slate-950 border-t border-slate-900 text-center text-slate-400 italic rounded-xl flex items-center justify-center gap-2 font-sans select-none">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Only admins can send messages
                </div>
              );
            }

            return (
              <div className="flex flex-col w-full">
                {/* BOTTOM TYPING PILL */}
                {isOtherUserTyping && (
                  <div className="px-4 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gray-900/90 border border-teal-500/30 text-teal-300 text-xs shadow-md backdrop-blur-md">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"></span>
                      </div>
                      <span className="font-medium text-[11px]">
                        {recipientName?.split(' ')[0] || 'User'} is typing...
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5 w-full px-2 py-2.5 sm:px-4 bg-[#0B111E] border-t border-slate-900/60 box-border">
                  {/* Attachment Menu Popup */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*,.pdf,.doc,.docx,.txt,.mp4,.mp3,.webm" 
                    className="hidden" 
                  />
                  <div className="relative flex items-center flex-shrink-0" ref={attachMenuRef}>
                    <button 
                      type="button" 
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      disabled={isUploading}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer text-xs flex-shrink-0 ${
                        isUploading ? "bg-teal-950/20 border-teal-500 text-teal-400 animate-pulse" : "bg-slate-900/60 border-slate-800"
                      }`}
                      title="Add Attachment"
                    >
                      {isUploading ? "⏳" : "📎"}
                    </button>

                    {/* Attachment Popover */}
                    {showAttachMenu && (
                      <div className="absolute bottom-14 left-0 z-50 w-44 bg-gray-950/95 border border-slate-800 rounded-2xl shadow-2xl p-1.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-1 select-none">
                        {/* Document / Media Upload Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachMenu(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-slate-800/80 hover:text-teal-300 rounded-xl transition-colors cursor-pointer text-left"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <span>Upload File</span>
                        </button>

                        {/* POLL BUTTON IN ATTACHMENT MENU */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachMenu(false);
                            setShowPollModal(true);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-teal-500/20 hover:text-teal-300 rounded-xl transition-colors cursor-pointer text-left"
                        >
                          <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <span>Create Poll</span>
                        </button>
                      </div>
                    )}
                  </div>

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
                      onChange={handleInputChange}
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
            );
          })()}
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

          {isGroupChat ? (
            /* GROUP DETAILS DISPLAY */
            <div className="text-center mb-6 border-b border-slate-900 pb-6">
              <div className="relative w-20 h-20 mx-auto mb-3 group/avatar">
                {activeChat.groupAvatar ? (
                  <img 
                    src={activeChat.groupAvatar} 
                    alt="Group Avatar" 
                    className="w-20 h-20 rounded-2xl object-cover border border-slate-800"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black text-3xl shadow-lg">
                    👥
                  </div>
                )}
                {(activeChat.admins || []).includes(currentUser.uid) && (
                  <label className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-[10px] font-bold">
                    Edit
                    <input 
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const formData = new FormData();
                          formData.append("file", file);
                          
                          // Request upload signature
                          const API_BASE_URL = "https://qwik-messages.vercel.app";
                          const signRes = await axios.get(`${API_BASE_URL}/api/get-upload-signature`);
                          if (!signRes.data.success) throw new Error("Signature error");
                          
                          const { signature, timestamp, cloudName, apiKey, folder } = signRes.data;
                          
                          const uploadData = new FormData();
                          uploadData.append("file", file);
                          uploadData.append("api_key", apiKey);
                          uploadData.append("timestamp", timestamp);
                          uploadData.append("signature", signature);
                          uploadData.append("folder", folder);
                          
                          const uploadRes = await axios.post(
                            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
                            uploadData
                          );
                          
                          if (uploadRes.data.secure_url) {
                            const chatDocRef = doc(db, "chats", activeChat.id);
                            await setDoc(chatDocRef, {
                              groupAvatar: uploadRes.data.secure_url,
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                            setActiveChat(prev => ({ ...prev, groupAvatar: uploadRes.data.secure_url }));
                            alert("Group profile picture updated successfully!");
                          }
                        } catch (err) {
                          console.error("Group DP upload failed:", err);
                          alert("Failed to upload group profile picture.");
                        }
                      }}
                    />
                  </label>
                )}
              </div>
               <div className="flex flex-col items-center mt-3 mb-4 w-full px-4">
                {isEditingName ? (
                  <div className="flex flex-col items-center gap-2.5 w-full animate-fade-in">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full max-w-[220px] bg-slate-950 border border-slate-800 text-white font-black text-center rounded-xl px-3 py-1.5 outline-none focus:border-teal-500 text-sm"
                      autoFocus
                    />
                    <div className="flex justify-center gap-4">
                      <button 
                        onClick={() => {
                          setIsEditingName(false);
                          setNewGroupName(activeChat.groupName || '');
                        }}
                        className="text-[9px] font-bold text-slate-400 hover:text-rose-400 transition-colors uppercase py-0.5"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={async () => {
                          if (newGroupName.trim() === (activeChat.groupName || '') || !newGroupName.trim()) {
                            setIsEditingName(false);
                            return;
                          }
                          try {
                            const chatDocRef = doc(db, "chats", activeChat.id);
                            await setDoc(chatDocRef, {
                              groupName: newGroupName.trim(),
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                            setActiveChat(prev => ({ ...prev, groupName: newGroupName.trim() }));
                            setIsEditingName(false);
                          } catch (err) {
                            console.error("Rename group failed:", err);
                            alert("Failed to save group name.");
                          }
                        }}
                        className="text-[9px] font-bold text-teal-400 hover:text-teal-300 transition-colors uppercase py-0.5"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-white font-black text-lg">{recipientName}</h4>
                    {(activeChat.admins || []).includes(currentUser.uid) && (
                      <button 
                        onClick={() => setIsEditingName(true)} 
                        className="text-[9px] font-bold text-teal-400 hover:text-teal-350 cursor-pointer ml-1"
                        title="Rename Group"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}

                {!isEditingName && (
                  <p className="text-xs text-slate-400 font-semibold mt-1">Group Workspace</p>
                )}
              </div>  
                 {/* Group Description */}
              <div className="mt-4 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Group Description</span>
                  {(activeChat.admins || []).includes(currentUser.uid) && !isEditingDesc && (
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="text-[9px] font-bold text-teal-400 hover:text-teal-350 cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingDesc ? (
                  <div className="flex flex-col gap-2 mt-1.5 animate-fade-in">
                    <textarea
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-teal-500 resize-none custom-scrollbar"
                      rows="3"
                      placeholder="Add a description for this group..."
                      autoFocus
                    />
                    <div className="flex justify-end gap-2.5">
                      <button 
                        onClick={() => {
                          setIsEditingDesc(false);
                          setNewGroupDesc(activeChat.groupDescription || '');
                        }} 
                        className="text-[9px] font-bold text-slate-400 hover:text-rose-400 transition-colors uppercase px-1.5 py-1"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={async () => {
                          if (newGroupDesc.trim() === (activeChat.groupDescription || '')) {
                            setIsEditingDesc(false);
                            return;
                          }
                          try {
                            const chatDocRef = doc(db, "chats", activeChat.id);
                            await setDoc(chatDocRef, {
                              groupDescription: newGroupDesc.trim(),
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                            setActiveChat(prev => ({ ...prev, groupDescription: newGroupDesc.trim() }));
                            setIsEditingDesc(false);
                          } catch (err) {
                            console.error("Save group desc failed:", err);
                            alert("Failed to save description.");
                          }
                        }} 
                        className="text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500 hover:text-slate-950 transition-all uppercase px-3 py-1 rounded-lg"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                    {activeChat.groupDescription || <span className="italic text-slate-500">No description set for this group yet.</span>}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* 1V1 DM DISPLAY */
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
          )}

          <div className="flex-1">
            {isGroupChat ? (
              /* GROUP MEMBERS LIST */
              <div className="space-y-4 mb-6 w-full text-left">
                <div className="flex items-center justify-between pl-1">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Group Members</h3>
                  {(activeChat.admins || []).includes(currentUser.uid) && (
                    <button
                      onClick={() => setIsGroupSearchOpen(true)}
                      className="text-[10px] font-black text-teal-400 hover:text-teal-300 uppercase tracking-wider cursor-pointer"
                    >
                      + Add Member
                    </button>
                  )}
                </div>

                <div className="bg-slate-900/60 border border-slate-800/60 p-3 rounded-2xl flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {(activeChat.participants || []).map((uid) => {
                    const adminsList = activeChat.admins || [];
                    const isUserAdmin = adminsList.includes(uid);
                    const amIGroupAdmin = adminsList.includes(currentUser.uid);
                    const resolved = resolvedMembers[uid];
                    const memberName = resolved ? resolved.displayName : uid.substring(0, 10);
                    const memberAvatar = resolved?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName)}&background=0f172a&color=cbd5e1`;
                    return (
                      <div key={uid} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-900/50">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img 
                            src={memberAvatar} 
                            alt="" 
                            className="w-6 h-6 rounded-full border border-slate-800 object-cover"
                          />
                          <div className="truncate text-left">
                            <p className="text-xs font-bold text-white truncate">
                              {uid === currentUser.uid ? `${memberName} (You)` : memberName}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isUserAdmin && (
                            <span className="text-[8px] font-black bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Admin
                            </span>
                          )}
                          {amIGroupAdmin && uid !== currentUser.uid && (
                            <button
                              onClick={async () => {
                                try {
                                  const chatDocRef = doc(db, "chats", activeChat.id);
                                  if (isUserAdmin) {
                                    await setDoc(chatDocRef, {
                                      admins: arrayRemove(uid)
                                    }, { merge: true });
                                    setActiveChat(prev => ({ ...prev, admins: (prev.admins || []).filter(id => id !== uid) }));
                                  } else {
                                    await setDoc(chatDocRef, {
                                      admins: arrayUnion(uid)
                                    }, { merge: true });
                                    setActiveChat(prev => ({ ...prev, admins: [...(prev.admins || []), uid] }));
                                  }
                                } catch (err) {
                                  console.error("Failed to toggle admin role:", err);
                                }
                              }}
                              className="text-[9px] text-teal-400 hover:underline cursor-pointer font-bold"
                            >
                              {isUserAdmin ? "Dismiss" : "Promote"}
                            </button>
                          )}
                          {!isUserAdmin && amIGroupAdmin && (
                            <button
                              onClick={async () => {
                                if (!window.confirm("Kick this member from the group?")) return;
                                try {
                                  const chatDocRef = doc(db, "chats", activeChat.id);
                                  await setDoc(chatDocRef, {
                                    participants: arrayRemove(uid)
                                  }, { merge: true });
                                  console.log("Removed member from group:", uid);
                                } catch (err) {
                                  console.error("Remove member failed:", err);
                                }
                              }}
                              className="text-[9px] font-bold text-rose-500 hover:text-rose-400 cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Only Admins Can Message Toggle Switch */}
                {(activeChat.admins || []).includes(currentUser.uid) && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/60 mt-4 select-none">
                    <div className="text-left">
                      <p className="text-xs font-bold text-white">Only Admins Can Message</p>
                      <p className="text-[9px] text-slate-400">Restrict normal members from posting texts.</p>
                    </div>
                    <input 
                      type="checkbox"
                      checked={activeChat.onlyAdminsCanMessage || false}
                      onChange={async (e) => {
                        const targetVal = e.target.checked;
                        try {
                          const chatDocRef = doc(db, "chats", activeChat.id);
                          await setDoc(chatDocRef, {
                            onlyAdminsCanMessage: targetVal
                          }, { merge: true });
                          setActiveChat(prev => ({ ...prev, onlyAdminsCanMessage: targetVal }));
                        } catch (err) {
                          console.error("Toggle restricted chat mode failed:", err);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-teal-500 focus:ring-teal-500/20 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* ABOUT & ACTIVITY SECTION (Replaces old Connection Metadata) */
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

                  {/* SHARED MEDIA, VIDEOS & DOCUMENTS HUB */}
                  {(() => {
                    const photoList = allMediaItems.photos || [];
                    const videoList = allMediaItems.videos || [];
                    const docList = allMediaItems.docs || [];
                    const totalMediaCount = photoList.length + videoList.length + docList.length;

                    return (
                      <>
                        <div className="h-px w-full bg-slate-800/50"></div>
                        <div className="flex flex-col gap-2.5 pt-1 text-left">
                          {/* SECTION TITLE & TAB BAR */}
                          <div className="flex items-center justify-between px-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Shared Media & Files
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                              {totalMediaCount} Total
                            </span>
                          </div>

                          {/* SEGMENTED TABS */}
                          <div className="grid grid-cols-3 gap-1 bg-gray-950/80 p-1 rounded-xl border border-gray-800">
                            <button
                              type="button"
                              onClick={() => setMediaTab('photos')}
                              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                mediaTab === 'photos'
                                  ? 'bg-teal-500 text-gray-950 shadow'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>Photos</span>
                              <span className="text-[9px] opacity-75">({photoList.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setMediaTab('videos')}
                              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                mediaTab === 'videos'
                                  ? 'bg-teal-500 text-gray-950 shadow'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>Videos</span>
                              <span className="text-[9px] opacity-75">({videoList.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setMediaTab('docs')}
                              className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                mediaTab === 'docs'
                                  ? 'bg-teal-500 text-gray-950 shadow'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <span>Docs</span>
                              <span className="text-[9px] opacity-75">({docList.length})</span>
                            </button>
                          </div>

                          {/* TAB 1: PHOTOS GRID */}
                          {mediaTab === 'photos' && (
                            <div className="max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                              {photoList.length > 0 ? (
                                <div className="grid grid-cols-3 gap-1.5">
                                  {photoList.map((photo) => (
                                    <div
                                      key={photo.id}
                                      onClick={() => window.open(photo.mediaUrl, '_blank')}
                                      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-950 border border-gray-800 cursor-pointer"
                                    >
                                      <img
                                        src={photo.mediaUrl}
                                        alt="shared photo"
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-5 text-gray-500 text-xs">
                                  <svg className="w-6 h-6 mx-auto mb-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  No shared photos
                                </div>
                              )}
                            </div>
                          )}

                          {/* TAB 2: VIDEOS GRID */}
                          {mediaTab === 'videos' && (
                            <div className="max-h-52 overflow-y-auto custom-scrollbar pr-0.5">
                              {videoList.length > 0 ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {videoList.map((video) => (
                                    <div
                                      key={video.id}
                                      onClick={() => window.open(video.mediaUrl, '_blank')}
                                      className="relative aspect-video rounded-xl overflow-hidden bg-gray-950 border border-gray-800 cursor-pointer group flex items-center justify-center"
                                    >
                                      <video src={video.mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                                        <div className="w-7 h-7 rounded-full bg-teal-500/90 text-gray-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                          <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-5 text-gray-500 text-xs">
                                  <svg className="w-6 h-6 mx-auto mb-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  No shared videos
                                </div>
                              )}
                            </div>
                          )}

                          {/* TAB 3: DOCUMENTS LIST */}
                          {mediaTab === 'docs' && (
                            <div className="max-h-52 overflow-y-auto custom-scrollbar pr-0.5 space-y-1.5">
                              {docList.length > 0 ? (
                                docList.map((docItem) => {
                                  const fileExt = docItem.fileExt || docItem.fileName?.split('.').pop() || 'DOC';
                                  return (
                                    <div
                                      key={docItem.id}
                                      onClick={() => window.open(docItem.mediaUrl, '_blank')}
                                      className="flex items-center gap-2.5 p-2 rounded-xl bg-gray-950/70 hover:bg-gray-950 border border-gray-800/80 cursor-pointer transition-colors group text-left"
                                    >
                                      {/* Extension Badge */}
                                      <div className={`w-7 h-7 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold uppercase text-[8px] text-white ${
                                        fileExt.toLowerCase() === 'pdf' ? 'bg-rose-600' : 'bg-blue-600'
                                      }`}>
                                        {fileExt}
                                      </div>

                                      {/* File info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-gray-200 truncate group-hover:text-teal-300 transition-colors" title={docItem.fileName || 'Document'}>
                                          {docItem.fileName || 'Document File'}
                                        </div>
                                        <div className="text-[10px] text-gray-500">
                                          {docItem.fileSize || 'File'}
                                        </div>
                                      </div>

                                      {/* Open / Download Icon */}
                                      <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-teal-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-center py-5 text-gray-500 text-xs">
                                  <svg className="w-6 h-6 mx-auto mb-1 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  No shared documents
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  {/* Privacy and Relationship Controls Section */}
                  {!activeChat.type || activeChat.type === 'direct' ? (
                    <>
                      <div className="h-px w-full bg-slate-800/50"></div>
                      <div className="flex flex-col gap-3.5 pt-1 text-left">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Privacy Controls</p>
                        
                        {/* Unfriend Button */}
                        <button 
                          onClick={async () => {
                            if (!window.confirm("Remove this conversation from your active chats? This cannot be undone.")) return;
                            try {
                              const chatRoomId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;
                              if (chatRoomId) {
                                const chatDocRef = doc(db, "chats", chatRoomId);
                                // soft remove: remove current user from active participants list
                                const participantsUpdated = (activeChat.participants || []).filter(p => p !== currentUser.uid);
                                await setDoc(chatDocRef, {
                                  participants: participantsUpdated,
                                  updatedAt: serverTimestamp()
                                }, { merge: true });
                                setActiveChat(null);
                              }
                            } catch (err) {
                              console.error("Unfriend failed:", err);
                            }
                          }}
                          className="flex items-center text-xs font-bold text-slate-400 hover:text-red-400 transition-colors gap-2.5 w-full text-left cursor-pointer p-1"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                          </svg>
                          Unfriend this person
                        </button>

                        {/* Block/Unblock Button */}
                        <button 
                          onClick={async () => {
                            if (!recipient?.uid) return;
                            try {
                              const currentUserRef = doc(db, "users", currentUser.uid);
                              const hasBlocked = currentUserProfile?.blockedUsers?.includes(recipient.uid);
                              await setDoc(currentUserRef, {
                                blockedUsers: hasBlocked ? arrayRemove(recipient.uid) : arrayUnion(recipient.uid)
                              }, { merge: true });
                              console.log(`Updated block state for ${recipient.uid}: ${!hasBlocked}`);
                            } catch (err) {
                              console.error("Block action failed:", err);
                            }
                          }}
                          className="flex items-center text-xs font-black text-rose-500 hover:text-rose-400 transition-colors gap-2.5 w-full text-left cursor-pointer p-1"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                          {currentUserProfile?.blockedUsers?.includes(recipient?.uid) ? "Unblock User" : "Block User"}
                        </button>
                      </div>
                    </>
                  ) : null}

                </div>
              </div>
            )}

            {/* Danger Zone */}
            <DangerZone isGroup={activeChat.type === 'group'} creatorId={activeChat.creatorId} />
          </div>
        </div>
      )}

      {isGroupChat && (
        <UserSearchModal 
          isOpen={isGroupSearchOpen} 
          onClose={() => setIsGroupSearchOpen(false)} 
          targetGroupId={activeChat.id} 
          existingParticipants={activeChat.participants} 
        />
      )}

      {showAddToGroupModal && (
        <AddToGroupModal 
          currentUser={currentUser} 
          targetUser={activeChat} 
          closeModal={() => setShowAddToGroupModal(false)} 
        />
      )}

      {/* In-Chat Poll Creator Modal */}
      <CreatePollModal
        isOpen={showPollModal}
        onClose={() => setShowPollModal(false)}
        activeChatId={roomId}
        currentUser={currentUser}
      />

      {/* Action Feedback Toast */}
      <ChatToast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
