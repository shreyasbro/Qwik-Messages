import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 1. Generate a structured default username: e.g., @shreyas_thakur-8492$
export const generateDefaultUsername = (displayName = 'user', email = '') => {
  const base = displayName || email.split('@')[0] || 'user';
  const baseName = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 15);
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  const symbols = ['@', '#', '$', '_', '-'];
  const randomSym = symbols[Math.floor(Math.random() * symbols.length)];
  return `@${baseName}-${randomNum}${randomSym}`;
};

// 2. Uniqueness Shield: Check if username exists in Firestore
export const isUsernameAvailable = async (targetUsername, currentUserId) => {
  if (!targetUsername || !targetUsername.trim()) return false;
  
  // Clean and format: ensure it starts with '@' and is lowercase
  let cleanName = targetUsername.trim().toLowerCase();
  if (!cleanName.startsWith('@')) cleanName = '@' + cleanName;

  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', cleanName));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return true;
    // It is valid if the only matched document belongs to the current user
    return snapshot.docs.every(doc => doc.id === currentUserId);
  } catch (error) {
    console.warn("⚠️ Uniqueness Query Exception (Proceeding with save fallback):", error.message);
    return true; // Prevent silent aborts during dev if indexes are building
  }
};
