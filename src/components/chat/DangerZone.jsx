import React from 'react';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

export default function DangerZone({ isGroup = false, creatorId = null }) {
  const { currentUser } = useAuth();
  const { activeChat, setActiveChat } = useChat();

  const handleClearHistory = async () => {
    if (!window.confirm("Wipe all message logs? This cannot be undone.")) return;
    try {
      await chatService.clearChatHistory(activeChat.chatId);
    } catch (e) {
      console.error("Clear logs failed:", e);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("Leave this group room?")) return;
    try {
      await chatService.leaveGroup(activeChat.chatId, currentUser.uid);
      setActiveChat(null);
    } catch (e) {
      console.error("Leave group failed:", e);
    }
  };

  const handleDeleteGlobally = async () => {
    if (!window.confirm("Wipe this entire group room from all participants?")) return;
    try {
      await chatService.deleteGroupGlobally(activeChat.chatId);
      setActiveChat(null);
    } catch (e) {
      console.error("Delete group failed:", e);
    }
  };

  const isCreator = currentUser?.uid === creatorId;

  return (
    <div className="w-full border border-rose-500/30 bg-rose-950/10 rounded-2xl p-4 mt-6 select-none">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-rose-500">⚠️</span>
        <h3 className="text-xs font-black uppercase tracking-widest text-rose-400">
          Danger Zone
        </h3>
      </div>

      <div className="flex flex-col gap-2">
        {!isGroup ? (
          /* DM DESTRUCTIVE ACTION ONLY */
          <button
            onClick={handleClearHistory}
            className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/60 rounded-xl transition-all duration-150 cursor-pointer active:scale-[0.99] text-left"
          >
            <div>
              <h4 className="text-sm font-bold text-white">Delete Chat History</h4>
              <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Permanently clear message logs from your inbox.</p>
            </div>
            <span className="text-rose-500 font-bold text-lg">→</span>
          </button>
        ) : (
          /* GROUP DESTRUCTIVE ACTIONS */
          <>
            <button
              onClick={handleLeaveGroup}
              className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/60 rounded-xl transition-all duration-150 cursor-pointer active:scale-[0.99] text-left"
            >
              <div>
                <h4 className="text-sm font-bold text-white">Leave Group</h4>
                <p className="text-[10px] text-slate-300 mt-0.5 font-medium">Exit from group room list immediately.</p>
              </div>
              <span className="text-rose-500 font-bold text-lg">→</span>
            </button>

            {isCreator && (
              <button
                onClick={handleDeleteGlobally}
                className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-rose-950/50 to-red-950/50 hover:from-rose-950 hover:to-red-950 border border-rose-500/80 rounded-xl transition-all duration-150 cursor-pointer active:scale-[0.99] text-left"
              >
                <div>
                  <h4 className="text-sm font-black text-rose-300">Delete Group Globally</h4>
                  <p className="text-[10px] text-rose-200 mt-0.5 font-medium">Delete group and messages for all members.</p>
                </div>
                <span className="text-white font-bold text-lg">→</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
