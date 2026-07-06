import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';

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
    const unsubscribeProfile = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.data());
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
