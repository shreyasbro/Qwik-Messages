import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds
const THROTTLE_DELAY_MS = 10000; // Throttled updates (once every 10s)

export const useSessionTimeout = (currentUser) => {
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!currentUser) return;

    const checkSession = () => {
      const lastActive = localStorage.getItem('qwik_last_active');
      const now = Date.now();

      if (lastActive && (now - parseInt(lastActive, 10) > SEVEN_DAYS_MS)) {
        // Session Expired! Force Logout
        console.warn("Session expired due to 7 days of inactivity. Forcing logout.");
        localStorage.removeItem('qwik_last_active');
        signOut(auth);
      } else {
        // Active session, update timestamp
        localStorage.setItem('qwik_last_active', now.toString());
        lastUpdateRef.current = now;
      }
    };

    // Check immediately on app load
    checkSession();

    // Track user activity to reset the 7-day timer (throttled to once every 10 seconds)
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastUpdateRef.current > THROTTLE_DELAY_MS) {
        localStorage.setItem('qwik_last_active', now.toString());
        lastUpdateRef.current = now;
      }
    };

    // Listen for interactions using passive flags for scroll and mouse handlers performance
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [currentUser]);
};
