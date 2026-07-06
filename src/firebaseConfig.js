import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// Verified Production Credentials
const firebaseConfig = {
  apiKey: "AIzaSyDaCCwgpQksNNgLp3GXJx2ggjUEFpu4YPk",
  authDomain: "qwik-messages.firebaseapp.com",
  databaseURL: "https://qwik-messages-default-rtdb.firebaseio.com",
  projectId: "qwik-messages",
  storageBucket: "qwik-messages.firebasestorage.app",
  messagingSenderId: "440183384115",
  appId: "1:440183384115:web:e5c6a70463365642be9b46"
};

// Prevent duplicate initialization during Vite Hot Module Replacement (HMR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
