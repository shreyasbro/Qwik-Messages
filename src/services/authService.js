import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider } from '../firebaseConfig';
import { userService } from './userService';

export const authService = {
  // Sign In with Email
  signInWithEmail: async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update online status
    await userService.createUserProfile(user.uid, {
      status: "online",
      lastSeen: serverTimestamp()
    });
    
    return userCredential;
  },

  // Sign Up with Email
  signUpWithEmail: async (email, password, displayName) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update auth profile
    await updateProfile(user, { displayName });
    
    // Create/update user document in Firestore
    await userService.createUserProfile(user.uid, {
      uid: user.uid,
      displayName,
      email: user.email,
      photoURL: user.photoURL || null,
      status: "online",
      lastSeen: serverTimestamp(),
      createdAt: new Date().toISOString()
    });

    return userCredential;
  },

  // Sign In with Google
  signInWithGoogle: async () => {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const user = userCredential.user;

    // Create/update user profile in Firestore
    await userService.createUserProfile(user.uid, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      status: "online",
      lastSeen: serverTimestamp(),
      createdAt: new Date().toISOString()
    });

    return userCredential;
  },

  // Logout
  logout: async () => {
    const user = auth.currentUser;
    if (user) {
      await userService.createUserProfile(user.uid, {
        status: "offline",
        lastSeen: serverTimestamp()
      });
    }
    return signOut(auth);
  }
};
