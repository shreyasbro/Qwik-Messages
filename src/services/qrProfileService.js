import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { chatService } from './chatService';

/**
 * QR Profile & Friend Request Service
 * Provides permanent immutable profile QR generation, resolution, and friend actions.
 */

export const QR_PROFILE_PREFIX = 'qwik:profile:';

export const qrProfileService = {
  /**
   * Generates the immutable payload for a user's permanent profile QR.
   * Encodes the permanent, immutable public account ID (UID) - never mutable profile info.
   * Format: "qwik:profile:<uid>" or full URL on web: `${window.location.origin}/?add_friend=<uid>`
   */
  getPermanentProfilePayload: (uid) => {
    if (!uid) throw new Error('UID is required to generate permanent profile QR payload');
    const baseUrl = typeof window !== 'undefined' && window.location?.origin 
      ? window.location.origin 
      : 'https://qwik-messages.vercel.app';
    return `${baseUrl}/?friend_uid=${encodeURIComponent(uid)}`;
  },

  /**
   * Parses scanned text from camera, QR image, or deep-link parameter.
   * Extracts the target UID reliably whether it's a URL or internal schema string.
   */
  parseScannedPayload: (scannedText) => {
    if (!scannedText || typeof scannedText !== 'string') return null;
    const trimmed = scannedText.trim();

    // Pattern 1: URL with query param ?friend_uid=... or ?add_friend=...
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const urlObj = new URL(trimmed);
        const friendUid = urlObj.searchParams.get('friend_uid') || urlObj.searchParams.get('add_friend');
        if (friendUid) return friendUid.trim();
      }
    } catch {
      // Fall through to regex parsing
    }

    // Pattern 2: Custom URI scheme qwik:profile:<uid>
    if (trimmed.startsWith(QR_PROFILE_PREFIX)) {
      return trimmed.replace(QR_PROFILE_PREFIX, '').trim();
    }

    // Pattern 3: URL fallback via regex
    const match = trimmed.match(/[?&](?:friend_uid|add_friend)=([^&#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }

    // Pattern 4: Raw UID (20-36 chars alphanumeric)
    if (/^[a-zA-Z0-9_-]{20,40}$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  },

  /**
   * Resolves latest profile info from Firestore for a given UID.
   * Enforces account existence, active state, and privacy/block rules.
   */
  resolveProfileByUid: async (targetUid, currentUid = null) => {
    if (!targetUid) {
      return { success: false, error: 'Invalid profile QR code.' };
    }

    if (currentUid && targetUid === currentUid) {
      return { success: false, isSelf: true, error: "This is your own profile QR code." };
    }

    try {
      const userRef = doc(db, 'users', targetUid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        return { 
          success: false, 
          error: 'This account no longer exists or has been deactivated.' 
        };
      }

      const userData = snap.data();

      // Check if account is disabled or marked deleted
      if (userData.disabled === true || userData.isDeleted === true) {
        return {
          success: false,
          error: 'This account is currently disabled or inactive.'
        };
      }

      // Check if current user is blocked by target user or target is blocked by current user
      if (currentUid) {
        const targetBlocked = userData.privacySettings?.blockedUsers || [];
        if (targetBlocked.includes(currentUid)) {
          return {
            success: false,
            error: 'You cannot connect with this user due to their privacy settings.'
          };
        }

        // Check if current user has blocked target user
        const currentUserRef = doc(db, 'users', currentUid);
        const currentSnap = await getDoc(currentUserRef);
        if (currentSnap.exists()) {
          const myBlocked = currentSnap.data()?.privacySettings?.blockedUsers || [];
          if (myBlocked.includes(targetUid)) {
            return {
              success: false,
              isBlockedByMe: true,
              error: 'You have currently blocked this user in Settings.'
            };
          }
        }
      }

      return {
        success: true,
        user: {
          uid: targetUid,
          displayName: userData.displayName || userData.name || 'Qwik User',
          username: userData.username || userData.userName || '',
          email: userData.email || '',
          photoURL: userData.photoURL || userData.avatar || null,
          customAvatarUrl: userData.customAvatarUrl || null,
          bio: userData.bio || userData.about || 'Hey there! I am using Qwik Messages.',
          presenceStatus: userData.presenceStatus || 'online',
        }
      };
    } catch (err) {
      console.error('Failed to resolve profile from QR code:', err);
      return { success: false, error: 'Failed to retrieve profile details. Please try again.' };
    }
  },

  /**
   * Atomically initiates or opens the chat/friend connection after explicit confirmation.
   */
  confirmAndAddFriend: async (currentUser, targetUser) => {
    if (!currentUser?.uid || !targetUser?.uid) {
      throw new Error('Both users are required to confirm friendship.');
    }
    if (currentUser.uid === targetUser.uid) {
      throw new Error('You cannot add yourself as a friend.');
    }

    return await chatService.initiateChatRoom(currentUser, targetUser);
  }
};
