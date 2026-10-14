import React, { useState, useEffect, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { isUsernameAvailable } from '../../utils/usernameUtils';
import { userService } from '../../services/userService';
import PhotoEditorModal from './PhotoEditorModal';
import PresenceBadge, { PRESENCE_OPTIONS } from './PresenceBadge';
import ShowQRCodeModal from './ShowQRCodeModal';

export default function ProfileEditorModal({ isOpen, onClose, currentUser, userProfile }) {
  const [displayName, setDisplayName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [username, setUsername] = useState(userProfile?.username || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || currentUser?.photoURL || '');
  const [bio, setBio] = useState(userProfile?.bio || "Hey there! I am using Qwik Messages.");
  const [presenceStatus, setPresenceStatus] = useState(userProfile?.presenceStatus || 'online');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingImageSrc, setEditingImageSrc] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  
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
      setPresenceStatus(userProfile.presenceStatus || 'online');
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

      // 4. CRITICAL ATOMIC WRITE: Strictly save username, bio, and presenceStatus to Firestore!
      const userDocRef = doc(db, 'users', currentUser.uid);
      await setDoc(userDocRef, {
        displayName: displayName.trim(),
        username: formattedUsername, // Absolutely enforce this payload!
        photoURL: finalPhotoUrl,
        bio: bio.trim(),
        presenceStatus,
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
      <main className="flex-1 w-full overflow-y-auto p-4 md:p-6 custom-scrollbar max-w-md md:max-w-2xl lg:max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* TOP SECTION: STACKED ON MOBILE, 2-COLUMN ON DESKTOP */}
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 mb-6">
            
            {/* LEFT COLUMN: AVATAR WITH BADGE */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="relative group">
                <div 
                  onClick={handlePhotoClick}
                  className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-2 border-slate-800 hover:border-emerald-500 transition-colors cursor-pointer group animate-fade-in"
                >
                  <img
                    src={photoURL || userService.resolveAvatar(userProfile || currentUser)}
                    alt="Profile Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-black uppercase tracking-wider">
                    <span>📸</span>
                    <span>Change</span>
                  </div>
                </div>
                {/* Presence Badge Overlay on Avatar */}
                <PresenceBadge className="absolute bottom-1 right-1 z-10" status={presenceStatus}/>
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                onChange={handleFileChange}
                className="hidden"
              />
              {uploading && <span className="text-[10px] text-slate-400 font-bold mt-1">Uploading preview...</span>}
              <span className="text-[11px] text-slate-400 mt-2 font-medium">Profile Photo</span>
            </div>

            {/* RIGHT COLUMN: SET PRESENCE STATUS SELECTOR */}
            <div className="flex-1 w-full text-left">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2.5 text-center md:text-left">
                Set Presence Status
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-2.5">
                {PRESENCE_OPTIONS.map((opt) => {
                  const isSelected = presenceStatus === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPresenceStatus(opt.id)}
                      className={`flex items-start gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/15 border-teal-500 ring-1 ring-teal-500/50 shadow-sm'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{opt.renderIcon('w-3.5 h-3.5 md:w-4 md:h-4')}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-semibold ${isSelected ? 'text-teal-300' : 'text-slate-200'}`}>
                          {opt.label}
                        </div>
                        {/* Full description on PC; compact on mobile */}
                        <div className="text-[10px] md:text-[11px] leading-tight text-slate-400 mt-0.5 whitespace-normal">
                          {opt.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* SHOW QR TO FRIENDS ACTION BANNER */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-teal-950/40 via-slate-900/60 to-emerald-950/40 border border-teal-500/30 mb-6 shadow-md">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 text-lg">
                📱
              </div>
              <div>
                <h4 className="text-sm font-black text-white">Show QR to Friends</h4>
                <p className="text-[11px] text-slate-400">Share your permanent profile QR or scan a friend</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowQRModal(true)}
              className="py-2 px-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
            >
              Open QR
            </button>
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
      <ShowQRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        currentUser={currentUser}
        userProfile={userProfile}
      />
    </div>
  );
}
