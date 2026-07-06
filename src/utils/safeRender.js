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
