import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { generateDefaultUsername, isUsernameAvailable } from '../utils/usernameUtils';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return unsubscribeAuth;
  }, []);

  // Listen to Firestore profile updates for current user
  useEffect(() => {
    if (!currentUser?.uid) return;

    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsubscribeProfile = onSnapshot(userDocRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);
        
        // Auto-migrate if user doesn't have a username
        if (!data.username) {
          try {
            let candidate = generateDefaultUsername(data.displayName || currentUser.displayName || 'user', data.email || currentUser.email || '');
            let isAvailable = await isUsernameAvailable(candidate, currentUser.uid);
            
            let attempts = 0;
            while (!isAvailable && attempts < 10) {
              candidate = generateDefaultUsername(data.displayName || currentUser.displayName || 'user', data.email || currentUser.email || '');
              isAvailable = await isUsernameAvailable(candidate, currentUser.uid);
              attempts++;
            }

            await setDoc(userDocRef, { username: candidate }, { merge: true });
            console.log(`✅ Automatically migrated user to username: ${candidate}`);
          } catch (err) {
            console.error("🚨 Username migration failure:", err);
          }
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to user profile:", error);
      setLoading(false);
    });

    return unsubscribeProfile;
  }, [currentUser]);

  const value = {
    currentUser,
    userProfile,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
