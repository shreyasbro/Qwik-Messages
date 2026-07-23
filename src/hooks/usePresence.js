import { useEffect } from "react";
import { io } from "socket.io-client";

// Initialize socket connection
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
});

export const usePresence = (currentUser, onStatusUpdate) => {
  useEffect(() => {
    if (!currentUser?.uid) return;

    // 1. Connect and emit online status
    socket.connect();
    socket.emit("user_online", currentUser.uid);

    // 2. Listen for global user status changes
    socket.on("update_user_status", (data) => {
      if (onStatusUpdate) {
        onStatusUpdate(data); // data = { userId, status: 'online' | 'offline', lastSeen }
      }
    });

    // 3. Instant cleanup on Tab Close / Refresh (`beforeunload`)
    const handleBeforeUnload = () => {
      socket.emit("user_offline");
      socket.disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 4. Cleanup on component unmount / logout
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      socket.emit("user_offline");
      socket.off("update_user_status");
      socket.disconnect();
    };
  }, [currentUser]);
};
