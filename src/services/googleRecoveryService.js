import { 
  reauthenticateWithPopup, 
  signInWithPopup, 
  GoogleAuthProvider,
  getIdToken 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

/**
 * Shared Google Account Recovery Service
 * Provides unified authentication, account matching, and recovery-linking logic
 * shared by AppLockScreen, SetLockModal, and SettingsModal.
 */
export const googleRecoveryService = {
  /**
   * Prompts user with Google account selection dialog
   * returns authenticated user or throws error
   */
  authenticateGoogleAccount: async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const reauthResult = await reauthenticateWithPopup(currentUser, provider);
        return reauthResult.user;
      } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('Google sign-in was closed before completing verification.');
        }
        // If reauthenticate fails because provider wasn't linked or user signed in with another method, fall back to signInWithPopup
        const signInResult = await signInWithPopup(auth, provider);
        return signInResult.user;
      }
    } else {
      const signInResult = await signInWithPopup(auth, provider);
      return signInResult.user;
    }
  },

  /**
   * Verifies whether an authenticated Google account matches the original account or a linked recovery account
   */
  verifyAccountOwnership: async (verifiedGoogleUser, originalUid, originalEmail) => {
    if (!verifiedGoogleUser || !originalUid) {
      return { matches: false, isPrimary: false, isRecovery: false, error: 'Missing account information.' };
    }

    const verifiedUid = verifiedGoogleUser.uid;
    const verifiedEmail = verifiedGoogleUser.email ? verifiedGoogleUser.email.toLowerCase() : '';
    const origEmail = (originalEmail || '').toLowerCase();

    // 1. Direct Primary match (UID match or verified email match with original registered account)
    if (verifiedUid === originalUid || (verifiedEmail && origEmail && verifiedEmail === origEmail)) {
      return {
        matches: true,
        isPrimary: true,
        isRecovery: false,
        email: verifiedGoogleUser.email,
        uid: verifiedUid,
      };
    }

    // 2. Check Firestore user profile for an established linked recovery account
    try {
      const userDocRef = doc(db, 'users', originalUid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const linkedRecoveryEmail = data.recoveryGoogleEmail ? data.recoveryGoogleEmail.toLowerCase() : (data.recoveryEmail ? data.recoveryEmail.toLowerCase() : '');
        const linkedRecoveryUid = data.recoveryGoogleUid;
        const isVerified = Boolean(data.recoveryGoogleVerified || data.recoveryEmailVerified);

        if (isVerified && (
          (linkedRecoveryUid && verifiedUid === linkedRecoveryUid) ||
          (linkedRecoveryEmail && verifiedEmail && linkedRecoveryEmail === verifiedEmail)
        )) {
          return {
            matches: true,
            isPrimary: false,
            isRecovery: true,
            email: verifiedGoogleUser.email,
            uid: verifiedUid,
          };
        }
      }
    } catch (e) {
      console.warn('[GoogleRecovery] Firestore recovery check notice:', e.message);
    }

    // Account does not match primary or registered recovery account
    return {
      matches: false,
      isPrimary: false,
      isRecovery: false,
      email: verifiedGoogleUser.email,
      uid: verifiedUid,
    };
  },

  /**
   * Links a verified Google account as the official App Lock recovery identity
   * Prevents linking an account already registered to another user
   */
  linkRecoveryGoogleAccount: async (originalUid, verifiedGoogleUser) => {
    if (!originalUid || !verifiedGoogleUser) {
      throw new Error('Invalid user identity for account linking.');
    }

    const recoveryEmail = verifiedGoogleUser.email;
    const recoveryUid = verifiedGoogleUser.uid;

    if (!recoveryEmail) {
      throw new Error('Google account does not provide a verified email address.');
    }

    // Guard: Prevent linking if this Google account is already the primary identity of another registered user
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', recoveryEmail));
      const snap = await getDocs(q);
      let duplicatePrimary = false;
      snap.forEach((docSnap) => {
        if (docSnap.id !== originalUid) {
          duplicatePrimary = true;
        }
      });

      if (duplicatePrimary) {
        throw new Error('This Google account is already registered as another user\'s primary Qwik-Messages account. Please choose a different account.');
      }
    } catch (checkErr) {
      // If Firestore query rules prevent querying all users, proceed with individual user update
      if (checkErr.message && checkErr.message.includes('already registered')) {
        throw checkErr;
      }
      console.warn('[GoogleRecovery] Check notice:', checkErr.message);
    }

    // Persist verified recovery account to user document
    const userRef = doc(db, 'users', originalUid);
    const updatePayload = {
      recoveryGoogleEmail: recoveryEmail,
      recoveryGoogleUid: recoveryUid,
      recoveryGoogleVerified: true,
      recoveryEmail: recoveryEmail,
      recoveryEmailVerified: true,
      recoveryGoogleLinkedAt: new Date().toISOString(),
    };

    await setDoc(userRef, updatePayload, { merge: true });

    // Update localStorage cache
    try {
      const cachedKey = `privacy_${originalUid}`;
      const cached = JSON.parse(localStorage.getItem(cachedKey) || '{}');
      cached.recoveryGoogleEmail = recoveryEmail;
      cached.recoveryEmail = recoveryEmail;
      cached.recoveryEmailVerified = true;
      localStorage.setItem(cachedKey, JSON.stringify(cached));
    } catch (e) {
      console.warn('[GoogleRecovery] Cache update notice:', e);
    }

    return {
      success: true,
      recoveryEmail,
    };
  },

  /**
   * Unlinks recovery Google account
   */
  unlinkRecoveryGoogleAccount: async (originalUid) => {
    if (!originalUid) return;
    const userRef = doc(db, 'users', originalUid);
    await setDoc(
      userRef,
      {
        recoveryGoogleEmail: null,
        recoveryGoogleUid: null,
        recoveryGoogleVerified: false,
        recoveryEmail: null,
        recoveryEmailVerified: false,
        recoveryGoogleUnlinkedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
};
