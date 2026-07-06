import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const userService = {
  // Create or merge user profile in Firestore
  createUserProfile: async (uid, data) => {
    const userRef = doc(db, 'users', uid);
    return setDoc(userRef, data, { merge: true });
  },

  // Get user profile
  getUserProfile: async (uid) => {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    return snap.exists() ? snap.data() : null;
  },

  // Get all users from Firestore
  getAllUsers: async () => {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const users = [];
    snap.forEach((docSnap) => {
      users.push({ uid: docSnap.id, ...docSnap.data() });
    });
    return users;
  },

  // 3-Tier Avatar Resolution Helper (Zero cartoon SVG placeholders)
  resolveAvatar: (user) => {
    if (!user) {
      return `https://ui-avatars.com/api/?name=User&background=0d9488&color=fff&bold=true`;
    }
    
    // Support either flat user object or participant object structure
    const customUrl = user.customAvatarUrl || user.avatarUrl;
    const oauthUrl = user.photoURL || user.avatar;
    const name = user.displayName || user.name || 'User';

    // Intercept any cartoon links to maintain design compliance
    const isCartoonUrl = (url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return lower.includes('dicebear') || lower.includes('multiavatar') || lower.includes('bottts') || lower.includes('robohash');
    };

    if (customUrl && !isCartoonUrl(customUrl)) return customUrl;
    if (oauthUrl && !isCartoonUrl(oauthUrl)) return oauthUrl;

    const cleanName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${cleanName}&background=0d9488&color=fff&bold=true`;
  }
};
