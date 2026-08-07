import React, { useState, useEffect, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { isUsernameAvailable } from '../../utils/usernameUtils';
import { userService } from '../../services/userService';
import PhotoEditorModal from './PhotoEditorModal';

export default function ProfileEditorModal({ isOpen, onClose, currentUser, userProfile }) {
  const [displayName, setDisplayName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [username, setUsername] = useState(userProfile?.username || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || currentUser?.photoURL || '');
  const [bio, setBio] = useState(userProfile?.bio || "Hey there! I am using Qwik Messages.");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingImageSrc, setEditingImageSrc] = useState(null);
  
  // Uniqueness check state
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(''); // 'available', 'taken', or 'invalid'
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || currentUser?.displayName || '');
      setUsername(userProfile.username || '');
      setPhotoURL(userProfile.photoURL || currentUser?.photoURL || '');
      setBio(userProfile.bio || "Hey there! I am using Qwik Messages.");
    }
  }, [userProfile, currentUser]);

  // Debounced Username Uniqueness Check
  useEffect(() => {
    if (!username.trim()) {
      setUsernameStatus('');
      return;
    }

    if (!username.startsWith('@')) {
      setUsernameStatus('invalid');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setUsernameStatus('invalid');
      return;
    }

    // Don't verify if it matches user's current username
    if (cleanUsername === userProfile?.username?.toLowerCase()) {
      setUsernameStatus('available');
      return;
    }

    setCheckingUsername(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(cleanUsername, currentUser.uid);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch (err) {
        console.error("Error checking username availability:", err);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [username, userProfile, currentUser]);

  if (!isOpen) return null;

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingImageSrc(reader.result);
      setUploading(false);
    };
    reader.onerror = () => {
      alert('Error reading file.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;
    if (!currentUser) return;

    setSaving(true);
    try {
      // 1. Format and sanitize username strictly
      let formattedUsername = username.trim().toLowerCase();
      if (!formattedUsername.startsWith('@')) {
        formattedUsername = '@' + formattedUsername;
      }

      console.log(`🚀 Attempting to save Profile: [Name: ${displayName}] | [Username: ${formattedUsername}]`);

      // 2. Execute fail-safe uniqueness verification
      const available = await isUsernameAvailable(formattedUsername, currentUser.uid);
      if (!available) {
        alert(`⚠️ The username "${formattedUsername}" is already taken by someone else. Please choose another!`);
        setSaving(false);
        return;
      }

      // 3. File URL
      let finalPhotoUrl = photoURL;

      // 4. CRITICAL ATOMIC WRITE: Strictly save username and bio to Firestore!
      const userDocRef = doc(db, 'users', currentUser.uid);
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        username: formattedUsername, // Absolutely enforce this payload!
        photoURL: finalPhotoUrl,
        bio: bio.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      console.log("✅ Username and Profile successfully persisted to Firestore!");

      // 5. Update Firebase Auth (Strictly excluding Base64 photoURL)
      const authPayload = { displayName: displayName.trim() };
      if (finalPhotoUrl && !finalPhotoUrl.startsWith('data:image')) {
        authPayload.photoURL = finalPhotoUrl;
      }
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, authPayload);
      }

      alert("✅ Profile & Username updated successfully!");
      onClose();
    } catch (error) {
      console.error("🚨 Fatal Profile Save Error:", error);
      alert(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col h-[100dvh] w-full bg-slate-950 text-white overflow-hidden justify-start select-none">
      
      {/* Sleek Top Navigation Header with Back button */}
      <header className="flex-shrink-0 w-full flex items-center p-4 bg-slate-900 border-b border-slate-800 z-10">
        <button 
          type="button"
          onClick={onClose} 
          className="mr-4 p-2 rounded-full hover:bg-slate-800 transition-colors focus:outline-none cursor-pointer"
          aria-label="Go back"
        >
          <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-slate-100">Edit Profile</h1>
      </header>

      {/* Main Content Area: Flex-1 and scrollable */}
      <main className="flex-1 w-full overflow-y-auto p-4 md:p-6 custom-scrollbar max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar Upload Area */}
          <div className="flex flex-col items-center gap-2">
            <div 
              onClick={handlePhotoClick}
              className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-slate-800 hover:border-emerald-500 transition-colors cursor-pointer group"
            >
              <img 
                src={photoURL || userService.resolveAvatar(userProfile || currentUser)} 
                alt="Profile Preview" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-black uppercase tracking-wider">
                <span>📸</span>
                <span>Change Photo</span>
              </div>
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleFileChange}
              className="hidden"
            />
            {uploading && <span className="text-[10px] text-slate-400 font-bold">Uploading preview...</span>}
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name"
                className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1.5">
                Unique @Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val && !val.startsWith('@')) val = '@' + val;
                  setUsername(val);
                }}
                placeholder="@username"
                className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors font-semibold"
                required
              />
              {/* Uniqueness Status Indicators */}
              <div className="mt-1.5 min-h-[16px] text-[10px] font-bold mb-4">
                {checkingUsername && <span className="text-slate-400">Verifying registry...</span>}
                {!checkingUsername && usernameStatus === 'available' && (
                  <span className="text-emerald-400">🟢 Username available</span>
                )}
                {!checkingUsername && usernameStatus === 'taken' && (
                  <span className="text-rose-400">🔴 Username already taken!</span>
                )}
                {!checkingUsername && usernameStatus === 'invalid' && (
                  <span className="text-amber-400">⚠️ Minimum 3 letters, must start with @</span>
                )}
              </div>
            </div>

            {/* BIO / ABOUT ME FIELD */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Bio / About
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  {bio.length}/150
                </span>
              </div>
              <textarea
                rows="3"
                maxLength={150}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write something about yourself..."
                className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors resize-none shadow-inner"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || checkingUsername || usernameStatus !== 'available'}
              className="flex-1 py-3 bg-gradient-to-r from-emerald-400 to-teal-400 disabled:from-slate-800 disabled:to-slate-900 text-slate-950 disabled:text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-transform active:scale-95 cursor-pointer shadow-lg"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </main>
      {editingImageSrc && (
        <PhotoEditorModal 
          imageSrc={editingImageSrc} 
          onCancel={() => setEditingImageSrc(null)} 
          onApply={(finalPhoto) => { 
            setPhotoURL(finalPhoto); 
            setEditingImageSrc(null); 
          }} 
        />
      )}
    </div>
  );
}
