import { useEffect, useRef } from 'react';
import { socket } from './usePresence';

export const useChatPresence = (currentUser, activeChatId) => {
  const timeoutRef = useRef(null);
  const currentUserId = currentUser?.uid || currentUser?.id;

  useEffect(() => {
    if (!currentUserId || !activeChatId) return;

    const setOnline = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      socket.emit("set_chat_presence", {
        userId: currentUserId,
        chatId: activeChatId,
        isOnline: true
      });
    };

    const setOfflineWithDelay = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        socket.emit("set_chat_presence", {
          userId: currentUserId,
          chatId: activeChatId,
          isOnline: false
        });
      }, 5000); // ⚡ 5 Seconds Inactivity Grace Period
    };

    // Initialize as online upon mounting active chat
    setOnline();

    const handleVisibilityChange = () => {
      if (document.hidden) setOfflineWithDelay();
      else setOnline();
    };

    const handleWindowBlur = () => setOfflineWithDelay();
    const handleWindowFocus = () => setOnline();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      // Clean up state immediately when exiting chat room view
      socket.emit("set_chat_presence", {
        userId: currentUserId,
        chatId: activeChatId,
        isOnline: false
      });

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [currentUserId, activeChatId]);
};
