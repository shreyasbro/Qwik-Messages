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

  /**
   * Appends version query parameter to image URLs based on user profile update timestamp
   * Prevents stale browser caching without generating random URLs on every render.
   */
  versionAvatarUrl: (url, versionSeed) => {
    if (!url || typeof url !== 'string') return url;
    // Don't version local data: or blob: URLs or external SVG generators that already have seeds
    if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('ui-avatars.com')) {
      return url;
    }
    if (!versionSeed) return url;

    try {
      const parsed = new URL(url, 'https://qwik-messages.vercel.app');
      parsed.searchParams.set('v', String(versionSeed));
      return parsed.toString();
    } catch {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}v=${encodeURIComponent(String(versionSeed))}`;
    }
  },

  /**
   * Unified 4-Tier Avatar Resolution Helper
   * Guarantees all screens (sidebar, header, contact list, updates, modals)
   * display the authentic user profile picture with real-time updates and graceful initial fallbacks.
   */
  resolveAvatar: (user, options = {}) => {
    if (!user) {
      return `https://ui-avatars.com/api/?name=User&background=0d9488&color=fff&bold=true`;
    }

    // Support flat user object, Firebase User, or participant map object
    const customUrl = user.customAvatarUrl || user.avatarUrl;
    const standardUrl = user.photoURL || user.avatar;
    const name = user.displayName || user.name || user.userName || user.username || (user.email ? user.email.split('@')[0] : 'User');
    
    // Check for updated timestamp to safely bust stale browser caching
    const versionSeed = user.photoUpdatedAt || user.updatedAt?.seconds || user.updatedAt || options.version;

    // Reject cartoon SVGs
    const isCartoonUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      const lower = url.toLowerCase();
      return (
        lower.includes('dicebear') ||
        lower.includes('multiavatar') ||
        lower.includes('bottts') ||
        lower.includes('robohash')
      );
    };

    if (customUrl && !isCartoonUrl(customUrl)) {
      return userService.versionAvatarUrl(customUrl, versionSeed);
    }

    if (standardUrl && !isCartoonUrl(standardUrl)) {
      return userService.versionAvatarUrl(standardUrl, versionSeed);
    }

    // Default: Elegant initials avatar matching dark teal Qwik-Messages theme
    const cleanName = encodeURIComponent(String(name).trim() || 'User');
    return `https://ui-avatars.com/api/?name=${cleanName}&background=0d9488&color=fff&bold=true`;
  }
};
