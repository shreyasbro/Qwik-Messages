import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// 1. Check for API key presence
const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const isApiKeyMissing = !rawApiKey || typeof rawApiKey !== 'string' || rawApiKey.trim() === '';

if (isApiKeyMissing) {
  console.warn(
    `%c[Firebase Configuration Notice] ⚠️ VITE_FIREBASE_API_KEY is not defined in environment variables.
Please configure your environment variables in Vercel Settings -> Environment Variables.
Using verified client configuration fallback.`,
    'color: #f59e0b; font-weight: bold; font-size: 13px;'
  );
}

// 2. Verified Client Configuration with Graceful Fallback
const firebaseConfig = {
  apiKey: rawApiKey || 'AIzaSyDaCCwgpQksNNgLp3GXJx2ggjUEFpu4YPk',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'qwik-messages.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://qwik-messages-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'qwik-messages',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'qwik-messages.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '440183384115',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:440183384115:web:e5c6a70463365642be9b46'
};

// 3. Graceful Initialization Guard (prevents top-level white screen crash)
let app;
let auth;
let db;
let rtdb;
let storage;
let googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
  rtdb = getDatabase(app);
  storage = getStorage(app);
} catch (error) {
  console.error("🔥 [Firebase Init Guard] Failed to initialize Firebase services:", error.message);
  app = getApps()[0] || null;
}

export { app, auth, db, rtdb, storage, googleProvider };
export default app;
