import { useEffect } from "react";
import { io } from "socket.io-client";

// Initialize socket connection
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket"],   // Use pure WebSocket upgrade
  reconnection: false,          // 🛑 CRITICAL: Disable infinite background retry loops!
  reconnectionAttempts: 0,      // Try 0 extra retries if initial connection fails
  timeout: 3000,                // 3-second connection timeout
});

export const usePresence = (currentUser, onStatusUpdate) => {
  useEffect(() => {
    if (!currentUser?.uid) return;

    // 1. Safe manual connect attempt
    try {
      socket.connect();
      socket.emit("user_online", currentUser.uid);
    } catch (err) {
      console.log("ℹ️ Realtime presence server offline. Operating in fallback mode.");
    }

    // 2. Gracefully handle connect_error event without breaking UI
    const handleConnectError = (error) => {
      console.warn("⚠️ Socket server unreachable at " + SOCKET_URL + ". Realtime features paused.");
      socket.disconnect(); // Disconnect cleanly so it stops retrying
    };

    socket.on("connect_error", handleConnectError);

    socket.on("disconnect", (reason) => {
      console.log("ℹ️ Realtime Session suspended:", reason);
    });

    // 3. Listen for global user status changes
    socket.on("update_user_status", (data) => {
      if (onStatusUpdate) {
        onStatusUpdate(data); // data = { userId, status: 'online' | 'offline', lastSeen }
      }
    });

    // 4. Instant cleanup on Tab Close / Refresh (`beforeunload`)
    const handleBeforeUnload = () => {
      socket.emit("user_offline");
      socket.disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 5. Cleanup on component unmount / logout
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      socket.emit("user_offline");
      socket.off("update_user_status");
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect");
      socket.disconnect();
    };
  }, [currentUser]);
};
