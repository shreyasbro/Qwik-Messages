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
import { auth } from '../../firebaseConfig';

export default function ChatWindow() {
  const { activeChat, messages, setActiveChat } = useChat();
  const { currentUser } = useAuth();
  const [inputText, setInputText] = useState('');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const { initiateCall } = useCall();
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  const { recipient } = useRecipient(activeChat?.participants, currentUser?.uid);
  const recipientName = recipient?.displayName || activeChat?.recipient?.displayName || 'User';
  const avatarSrc = recipient?.photoURL || userService.resolveAvatar(activeChat?.recipient);

  // Filter messages not deleted for current user
  const safeMessages = messages.filter(m => !m.deletedFor?.includes(currentUser?.uid));

  // Deletion permission calculation
  const selectedObjs = safeMessages.filter(m => selectedMessageIds.includes(m.id));
  const canDeleteForEveryone = selectedObjs.length > 0 && selectedObjs.every(msg => msg.senderId === currentUser?.uid);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // 1. Robust Sender ID Resolution (Props fallback to direct Firebase Auth)
    const senderId = currentUser?.uid || auth.currentUser?.uid;
    if (!senderId) {
      alert("🚨 Authentication error: You appear to be logged out. Please refresh or re-login.");
      return;
    }

    // 2. Robust Chat ID Resolution (Check all possible key names)
    let targetChatId = activeChat?.id || activeChat?.chatId || activeChat?.roomId;

    // 3. Deterministic Fallback: If room ID is missing but we have participants, generate it atomically
    if (!targetChatId && activeChat?.participants && Array.isArray(activeChat.participants)) {
      const targetUserId = activeChat.participants.find(id => id !== senderId);
      if (targetUserId) {
        targetChatId = senderId > targetUserId ? `${senderId}_${targetUserId}` : `${targetUserId}_${senderId}`;
      }
    }

    if (!targetChatId) {
      console.error("🚨 Fatal Send Error: Could not resolve Chat ID from object:", activeChat);
      alert("Failed to send: Could not identify the active chat room. Please re-select the contact from the sidebar.");
      return;
    }

    const messageText = inputText.trim();
    setInputText(''); // Optimistic UI clear

    try {
      if (editingMessage) {
        await chatService.editMessage(String(targetChatId), String(editingMessage.id), messageText);
        setEditingMessage(null);
      } else {
        const replyPayload = replyingTo ? {
          id: String(replyingTo.id),
          text: String(replyingTo.text || ''),
          senderName: String(replyingTo.senderId === senderId ? 'Me' : (recipientName || 'User'))
        } : null;
        
        await chatService.sendMessage(String(targetChatId), String(senderId), messageText, null, replyPayload);
        setReplyingTo(null);
      }
    } catch (error) {
      console.error("🚨 Firestore Send Failure:", error);
      alert(`Message failed to send: ${error.message || "Network error"}`);
      setInputText(messageText); // Restore text on failure
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
    try {
      const currentChatId = String(activeChat?.chatId || activeChat?.id || '');
      const currentUserId = String(currentUser?.uid || '');
      await chatService.deleteMessageForMe(currentChatId, String(messageId), currentUserId);
    } catch (err) {
      console.error("Delete for me failed:", err);
      alert(`Failed to delete message: ${err.message || "Network Error"}`);
    }
  };

  const handleDeleteForEveryone = async (messageId) => {
    if (!window.confirm("Wipe this message from everyone's screens?")) return;
    try {
      const currentChatId = String(activeChat?.chatId || activeChat?.id || '');
      await chatService.deleteMessage(currentChatId, String(messageId));
    } catch (err) {
      console.error("Delete for everyone failed:", err);
      alert(`Failed to delete message for everyone: ${err.message || "Network Error"}`);
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
    try {
      const currentChatId = String(activeChat?.chatId || activeChat?.id || '');
      const currentUserId = String(currentUser?.uid || '');
      await Promise.all(selectedMessageIds.map(id => 
        chatService.deleteMessageForMe(currentChatId, String(id), currentUserId)
      ));
      setIsSelectMode(false);
      setSelectedMessageIds([]);
    } catch (err) {
      console.error("Bulk delete for me failed:", err);
      alert(`Failed to bulk delete messages: ${err.message || "Network Error"}`);
    }
  };

  const handleBulkDeleteForEveryone = async () => {
    if (!window.confirm(`Wipe ${selectedMessageIds.length} messages for everyone?`)) return;
    try {
      const currentChatId = String(activeChat?.chatId || activeChat?.id || '');
      await Promise.all(selectedMessageIds.map(id => 
        chatService.deleteMessage(currentChatId, String(id))
      ));
      setIsSelectMode(false);
      setSelectedMessageIds([]);
    } catch (err) {
      console.error("Bulk delete for everyone failed:", err);
      alert(`Failed to bulk delete messages for everyone: ${err.message || "Network Error"}`);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div className="flex-1 h-full bg-[#020617] flex flex-col items-center justify-center text-center p-6 select-none">
        <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-4xl mb-4">
          💬
        </div>
        <h2 className="text-xl font-black text-white tracking-tight">Select a Chat to Start Messaging</h2>
        <p className="text-sm text-slate-300 font-medium max-w-sm mt-2 leading-relaxed">
          Open a contact room or search for new peers to initiate next-gen secure channels.
        </p>
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
    <div className="flex-grow h-full flex bg-[#020617] overflow-hidden relative">
      
      {/* Primary Message Feed Window */}
      <div className="flex-1 h-full flex flex-col min-w-0 relative">
        
        {/* Chat Window Header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-900 bg-[#0B111E] z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => setActiveChat(null)}
              className="md:hidden text-slate-300 hover:text-white mr-1 text-lg font-bold"
            >
              ←
            </button>
            <img 
              src={avatarSrc} 
              alt={safeString(recipientName)} 
              className="w-10 h-10 rounded-full object-cover border border-slate-800" 
            />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">{safeString(recipientName, 'Chat Member')}</h3>
              <p className="text-[10px] text-slate-300 font-medium truncate">Direct Secure Connection</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => initiateCall(activeChat, 'video')}
              className="px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 rounded-lg transition-colors cursor-pointer"
            >
              📞 Call
            </button>
            <button
              onClick={() => setShowInfoPanel(!showInfoPanel)}
              className="px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              {showInfoPanel ? 'Hide Details' : 'View Info'}
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 relative bg-slate-950/40">
          <AnimatePresence initial={false}>
            {safeMessages.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-sm text-slate-300 font-medium">Say hi to your new friend! 👋</p>
              </div>
            ) : (
              safeMessages.map((m) => (
                <MessageBubble
                  key={m.id}
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
              ))
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Reply/Edit Active Display Indicator & Footer Input Bar */}
        <div className="border-t border-slate-900 bg-[#0B111E] z-10 relative">
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

          <div className="p-4 flex gap-2 items-end">
            {/* Emoji Trigger */}
            <div className="relative flex items-end">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-11 h-11 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center hover:text-amber-400 transition-colors text-lg cursor-pointer flex-shrink-0"
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

            <form onSubmit={handleSendMessage} className="flex-1 flex gap-2">
              <input
                type="text"
                placeholder={editingMessage ? "Edit your message..." : "Type your message..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-95 flex-shrink-0"
              >
                {editingMessage ? 'Save' : 'Send'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Right Drawer Info Panel */}
      {showInfoPanel && (
        <div className="w-[300px] border-l border-slate-900 bg-[#0B111E] h-full flex flex-col p-6 overflow-y-auto custom-scrollbar flex-shrink-0 animate-fade-in z-10">
          <div className="text-center mb-6 border-b border-slate-900 pb-6">
            <img src={avatarSrc} alt={safeString(recipientName)} className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-emerald-500/20 shadow-lg mb-3" />
            <h4 className="text-white font-black text-lg">{safeString(recipientName, 'Chat Member')}</h4>
            <p className="text-xs text-slate-300 truncate font-semibold">{safeString(recipient?.email || activeChat.recipient?.email, 'No email synced')}</p>
          </div>

          <div className="flex-1">
            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2">Connection Metadata</h5>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1.5 font-medium mb-6">
              <div className="flex justify-between">
                <span>Direct Node:</span>
                <span className="font-bold text-slate-300">Active</span>
              </div>
              <div className="flex justify-between">
                <span>Room ID:</span>
                <span className="font-mono text-[9px] truncate max-w-[120px] text-slate-300">{activeChat.chatId}</span>
              </div>
            </div>

            {/* Danger Zone */}
            <DangerZone isGroup={activeChat.type === 'group'} creatorId={activeChat.creatorId} />
          </div>
        </div>
      )}
      
    </div>
  );
}
