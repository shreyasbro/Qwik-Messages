import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { userService } from '../services/userService';

export function useRecipient(participants, currentUserUid) {
  const [recipient, setRecipient] = useState(null);
  const [loading, setLoading] = useState(true);

  const targetId = participants?.find(id => id !== currentUserUid);

  useEffect(() => {
    if (!targetId) {
      setRecipient(null);
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'users', targetId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const uData = snap.data();
        
        // 1. Resolve Display Name (Fall back to email username, NEVER just "User")
        const rawEmail = uData.email || '';
        const emailName = rawEmail ? rawEmail.split('@')[0] : 'Unknown Contact';
        const displayName = uData.displayName || uData.name || uData.userName || emailName;

        // 2. Resolve Avatar
        const photoURL = userService.resolveAvatar({
          customAvatarUrl: uData.customAvatarUrl,
          photoURL: uData.photoURL,
          avatar: uData.avatar,
          displayName
        });

        setRecipient({
          uid: targetId,
          ...uData,
          displayName,
          photoURL
        });
      } else {
        setRecipient({
          uid: targetId,
          displayName: 'Unknown Contact',
          photoURL: `https://ui-avatars.com/api/?name=Unknown+Contact&background=0d9488&color=fff&bold=true`
        });
      }
      setLoading(false);
    }, (err) => {
      console.error("Error loading recipient updates:", err);
      setLoading(false);
    });

    return unsubscribe;
  }, [targetId, currentUserUid]);

  return { recipient, loading };
}
