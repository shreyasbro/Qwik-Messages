import React, { useState, useMemo } from 'react';
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function ForwardModal({
  isOpen,
  onClose,
  messageToForward,
  chats = [],
  usersDirectory = {},
  allUsers = [],
  currentUser,
  onForwardSuccess
}) {
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);

  const myUid = currentUser?.uid;

  // 1. ROBUST CONTACT RESOLVER (GOOGLE AVATAR & NAME)
  const resolveTargetChat = (chat) => {
    if (!chat) return { title: 'Chat', subtitle: 'Direct Message', avatar: '', isGroup: false };

    // A. Group Chat
    if (chat.isGroup || chat.type === 'group') {
      const groupTitle = chat.groupName || chat.name || 'Group Chat';
      return {
        title: groupTitle,
        subtitle: `${chat.participants?.length || 0} members`,
        avatar: chat.groupAvatar || chat.photoURL || chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(groupTitle)}&background=0d9488&color=fff&bold=true`,
        isGroup: true,
      };
    }

    // B. Direct Chat: Find other participant UID
    let otherUid = null;
    if (Array.isArray(chat.participants)) {
      otherUid = chat.participants.find((id) => id !== myUid);
    } else if (Array.isArray(chat.participantIds)) {
      otherUid = chat.participantIds.find((id) => id !== myUid);
    } else if (chat.recipientUid && chat.recipientUid !== myUid) {
      otherUid = chat.recipientUid;
    } else if (chat.recipient?.uid && chat.recipient?.uid !== myUid) {
      otherUid = chat.recipient.uid;
    }

    // Lookup across usersDirectory / allUsers list
    const directoryUser = (otherUid && usersDirectory[otherUid]) || 
      (otherUid && allUsers.find((u) => (u.uid || u.id) === otherUid)) || 
      null;

    const embeddedData = (chat.participantsData && otherUid) 
      ? chat.participantsData[otherUid] 
      : null;

    const directUserObj = chat.user || chat.recipient || chat.otherUser || null;

    // Resolve Google Display Name
    const resolvedName =
      directoryUser?.displayName ||
      directoryUser?.name ||
      embeddedData?.displayName ||
      embeddedData?.name ||
      directUserObj?.displayName ||
      directUserObj?.name ||
      directoryUser?.email?.split('@')[0] ||
      embeddedData?.email?.split('@')[0] ||
      chat.chatName ||
      'Contact';

    // Resolve Google Profile Avatar
    const resolvedAvatar =
      directoryUser?.photoURL ||
      directoryUser?.avatar ||
      embeddedData?.photoURL ||
      embeddedData?.avatar ||
      directUserObj?.photoURL ||
      directUserObj?.avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName)}&background=0d9488&color=fff&bold=true`;

    return {
      title: resolvedName,
      subtitle: directoryUser?.email || embeddedData?.email || (chat.isGroup ? 'Group' : 'Direct Message'),
      avatar: resolvedAvatar,
      isGroup: false,
    };
  };

  // 2. SEARCH FILTERING
  const preparedList = useMemo(() => {
    return (chats || []).map((chat) => ({
      ...chat,
      meta: resolveTargetChat(chat),
    })).filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        item.meta.title.toLowerCase().includes(q) ||
        item.meta.subtitle.toLowerCase().includes(q)
      );
    });
  }, [chats, searchQuery, usersDirectory, allUsers, myUid]);

  if (!isOpen || !messageToForward) return null;

  const handleToggleSelect = (chatId) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  // Execute forwarding
  const handleExecuteForward = async () => {
    if (selectedChatIds.length === 0 || isSending) return;
    setIsSending(true);

    try {
      const forwardPromises = selectedChatIds.map(async (chatId) => {
        const targetChat = chats.find((c) => (c.id || c.chatId || c.roomId) === chatId);
        if (!targetChat) return;

        const effectiveChatId = targetChat.id || targetChat.chatId || targetChat.roomId || chatId;

        // 1. Add message with isForwarded flag
        const msgPayload = {
          text: messageToForward.text || '',
          mediaUrl: messageToForward.mediaUrl || '',
          fileUrl: messageToForward.fileUrl || '',
          fileName: messageToForward.fileName || '',
          fileExt: messageToForward.fileExt || '',
          fileSize: messageToForward.fileSize || '',
          type: messageToForward.type || (messageToForward.mediaUrl ? 'image' : 'text'),
          messageType: messageToForward.messageType || (messageToForward.mediaUrl ? 'media' : 'text'),
          isForwarded: true,
          senderId: myUid,
          senderName: currentUser?.displayName || currentUser?.name || 'User',
          senderAvatar: currentUser?.photoURL || '',
          createdAt: serverTimestamp(),
          timestamp: serverTimestamp(),
          timestampMillis: Date.now()
        };

        await addDoc(collection(db, 'chats', effectiveChatId, 'messages'), msgPayload);

        // 2. Identify target recipients
        let recipientUids = [];
        if (Array.isArray(targetChat.participants)) {
          recipientUids = targetChat.participants.filter((uid) => uid !== myUid);
        } else if (targetChat.recipient?.uid && targetChat.recipient?.uid !== myUid) {
          recipientUids = [targetChat.recipient.uid];
        }

        // 3. Update parent chat doc
        const chatDocRef = doc(db, 'chats', effectiveChatId);
        const snippet = messageToForward.text || (messageToForward.mediaUrl ? '📷 Photo' : 'Forwarded message');
        const updatePayload = {
          lastMessage: snippet,
          lastMessageSenderId: myUid,
          lastMessageTime: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        recipientUids.forEach((uid) => {
          updatePayload[`unreadCounts.${uid}`] = increment(1);
          updatePayload[`unread_${uid}`] = increment(1);
        });

        try {
          await updateDoc(chatDocRef, updatePayload);
        } catch {
          await setDoc(chatDocRef, updatePayload, { merge: true });
        }
      });

      await Promise.all(forwardPromises);
      setSelectedChatIds([]);
      if (onForwardSuccess) onForwardSuccess();
      onClose();
    } catch (err) {
      console.error('Error forwarding message:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl shadow-black flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 bg-gray-900/80 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Forward Message To</h3>
            <p className="text-[11px] text-gray-400">Select contacts or groups</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message Preview snippet */}
        <div className="px-4 py-2.5 bg-gray-900/40 border-b border-gray-800 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0 text-xs font-bold">
            ↪
          </div>
          <p className="text-xs text-gray-300 truncate italic">
            &quot;{messageToForward.text || (messageToForward.mediaUrl ? 'Photo/Media' : 'Attachment')}&quot;
          </p>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-2xl px-3 py-1.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-gray-500"
            />
          </div>
        </div>

        {/* Chat List with Real Google Avatars */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-900/50 p-2 space-y-1 custom-scrollbar">
          {preparedList.map((chat) => {
            const chatId = chat.id || chat.chatId || chat.roomId;
            const isSelected = selectedChatIds.includes(chatId);
            return (
              <div
                key={chatId}
                onClick={() => handleToggleSelect(chatId)}
                className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-teal-500/10 border-teal-500/40'
                    : 'bg-gray-900/30 hover:bg-gray-900/70 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={chat.meta.avatar}
                    alt={chat.meta.title}
                    className="w-10 h-10 rounded-full object-cover border border-gray-800 shrink-0"
                  />
                  <div className="min-w-0 text-left">
                    <h4 className="text-xs font-bold text-white truncate">{chat.meta.title}</h4>
                    <p className="text-[10px] text-gray-400 truncate">{chat.meta.subtitle}</p>
                  </div>
                </div>

                {/* Checkbox */}
                <div
                  className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all shrink-0 ${
                    isSelected ? 'bg-teal-500 border-teal-500 text-gray-950' : 'border-gray-700 bg-gray-950'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-gray-900/80 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-400">
            {selectedChatIds.length} {selectedChatIds.length === 1 ? 'chat' : 'chats'} selected
          </span>

          <button
            type="button"
            onClick={handleExecuteForward}
            disabled={selectedChatIds.length === 0 || isSending}
            className={`px-5 py-2 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg ${
              selectedChatIds.length > 0 && !isSending
                ? 'bg-teal-500 hover:bg-teal-400 text-gray-950 shadow-teal-500/20 cursor-pointer active:scale-95'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSending ? (
              <span>Sending...</span>
            ) : (
              <>
                <span>Forward</span>
                <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
