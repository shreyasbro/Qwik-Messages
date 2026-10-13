export const safeString = (val, fallback = '') => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  
  if (typeof val === 'object') {
    // 1. Check if it is a Firestore Timestamp
    if (typeof val.toDate === 'function') {
      try { 
        return val.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      } catch (e) { 
        return fallback; 
      }
    }
    // 2. Check if it is a standard JS Date
    if (val instanceof Date) {
      try { 
        return val.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      } catch (e) { 
        return fallback; 
      }
    }
    // 3. Check if it is a message object (e.g., lastMessage: { text: "hello" })
    if (val.text !== undefined) return String(val.text || fallback);
    if (val.message !== undefined) return String(val.message || fallback);
    
    // 4. Check if it is a user/recipient object
    if (val.displayName !== undefined) return String(val.displayName || fallback);
    if (val.name !== undefined) return String(val.name || fallback);
    if (val.email !== undefined) return String(val.email.split('@')[0] || fallback);
    
    // 5. Fallback for any other unknown object to PREVENT REACT CRASH #310
    return fallback;
  }
  return fallback;
};

/**
 * Resolves user profile photo based on privacy settings
 */
export const getVisibleAvatar = (user, viewerUid, viewerContacts = []) => {
  if (!user) return 'https://api.dicebear.com/7.x/bottts/svg?seed=default';
  
  // Own photo is always visible to oneself
  if (user.uid === viewerUid) return user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

  const setting = user.privacySettings?.profilePhoto || 'everyone';
  const allowed = user.privacySettings?.profilePhotoAllowed || [];

  if (setting === 'nobody') {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid || 'user'}`;
  }

  if (setting === 'contacts') {
    const isContact = viewerContacts.includes(user.uid) || (user.contacts || []).includes(viewerUid);
    if (!isContact) {
      return `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid || 'user'}`;
    }
  }

  if (setting === 'specific') {
    if (!allowed.includes(viewerUid)) {
      return `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid || 'user'}`;
    }
  }

  return user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid || 'user'}`;
};

/**
 * Resolves user About info based on privacy settings
 */
export const getVisibleAbout = (user, viewerUid, viewerContacts = []) => {
  if (!user) return '';
  if (user.uid === viewerUid) return user.about || user.statusBio || 'Hey there! I am using Qwik Messages.';

  const setting = user.privacySettings?.about || 'everyone';
  const allowed = user.privacySettings?.aboutAllowed || [];

  if (setting === 'nobody') return '';

  if (setting === 'contacts') {
    const isContact = viewerContacts.includes(user.uid) || (user.contacts || []).includes(viewerUid);
    if (!isContact) return '';
  }

  if (setting === 'specific') {
    if (!allowed.includes(viewerUid)) return '';
  }

  return user.about || user.statusBio || 'Hey there! I am using Qwik Messages.';
};

/**
 * Determines whether to display blue ticks (read receipts)
 */
export const shouldShowBlueTicks = (currentUser, targetUser) => {
  const myReceipts = currentUser?.privacySettings?.readReceipts !== false;
  const theirReceipts = targetUser?.privacySettings?.readReceipts !== false;
  return myReceipts && theirReceipts;
};

/**
 * Determines whether to display Last Seen / Online status
 */
export const shouldShowLastSeen = (user, viewerUid, viewerContacts = []) => {
  if (!user) return false;
  if (user.uid === viewerUid) return true;

  const setting = user.privacySettings?.lastSeen || 'everyone';
  const allowed = user.privacySettings?.lastSeenAllowed || [];

  if (setting === 'nobody') return false;
  if (setting === 'specific') {
    return allowed.includes(viewerUid);
  }
  
  return true;
};

/**
 * Calculates expiration timestamp for disappearing messages
 */
export const calculateExpiration = (timerSetting) => {
  const now = Date.now();
  if (timerSetting === '24h') return now + 24 * 60 * 60 * 1000;
  if (timerSetting === '7d') return now + 7 * 24 * 60 * 60 * 1000;
  if (timerSetting === '90d') return now + 90 * 24 * 60 * 60 * 1000;
  return null;
};
