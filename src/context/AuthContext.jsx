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
  const [duplicateAccountConfig, setDuplicateAccountConfig] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setDuplicateAccountConfig(null);
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

  // ⚡ DETECT DUAL ACCOUNTS
  useEffect(() => {
    if (!currentUser?.uid || !currentUser?.email) return;

    const scanDuplicateAccounts = async () => {
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", currentUser.email));
        const querySnapshot = await getDocs(q);

        let duplicateDoc = null;
        let currentDocData = null;

        querySnapshot.forEach((docSnap) => {
          if (docSnap.id !== currentUser.uid) {
            duplicateDoc = { id: docSnap.id, ...docSnap.data() };
          } else {
            currentDocData = docSnap.data();
          }
        });

        // Trigger Modal if duplicate exists and user hasn't previously declined
        if (duplicateDoc && !currentDocData?.mergeDeclined) {
          setDuplicateAccountConfig(duplicateDoc);
        }
      } catch (error) {
        console.error("❌ Auth duplicate scan failed:", error);
      }
    };

    scanDuplicateAccounts();
  }, [currentUser]);

  const value = {
    currentUser,
    userProfile,
    loading,
    duplicateAccountConfig,
    setDuplicateAccountConfig
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-950 text-white w-full select-none">
          {/* Animated Spinner */}
          <div className="relative flex items-center justify-center w-16 h-16 mb-4">
            <div className="absolute w-full h-full border-4 border-slate-900 rounded-full"></div>
            <div className="absolute w-full h-full border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          
          {/* Brand / Loading Text */}
          <h1 className="text-xl font-bold tracking-wider text-slate-200">
            Qwik Messages
          </h1>
          <p className="text-xs text-slate-500 mt-2 animate-pulse">
            Securely connecting...
          </p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
