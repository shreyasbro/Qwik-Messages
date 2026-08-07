import { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days in milliseconds

export const useSessionTimeout = (currentUser) => {
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
      }
    };

    // Check immediately on app load
    checkSession();

    // Track user activity to reset the 7-day timer
    const updateActivity = () => {
      localStorage.setItem('qwik_last_active', Date.now().toString());
    };

    // Listen for interactions
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('touchstart', updateActivity);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, [currentUser]);
};
