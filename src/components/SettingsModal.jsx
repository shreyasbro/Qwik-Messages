import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, updateDoc, onSnapshot, arrayRemove, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import SetLockModal from './SetLockModal';
import VerifyLockModal from './VerifyLockModal';
import SpecificContactsModal from './SpecificContactsModal';
import {
  getLocalCacheStats,
  clearLocalMediaCache,
  isFileSystemAccessSupported,
  requestLinkMediaFolder,
  getLinkedFolderStatus,
  unlinkMediaFolder,
} from '../services/localMediaService';

export default function SettingsModal({ isOpen, onClose, currentUser }) {
  // Persist currentView in sessionStorage so parent re-renders never bounce the user to 'main'
  const [currentView, setCurrentViewState] = useState(() => {
    return sessionStorage.getItem('qwik_active_settings_view') || 'main';
  });

  const setCurrentView = (view) => {
    sessionStorage.setItem('qwik_active_settings_view', view);
    setCurrentViewState(view);
  };

  const [privacyTab, setPrivacyTab] = useState('general'); // 'general' | 'blocked' | 'security'
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [activeSpecificModal, setActiveSpecificModal] = useState(null); // 'lastSeen' | 'profilePhoto' | 'about' | null
  const [showSetLockModal, setShowSetLockModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  // Storage & Local Media State
  const [storageStats, setStorageStats] = useState(null);
  const [folderStatus, setFolderStatus] = useState(null);
  const [isLinkingFolder, setIsLinkingFolder] = useState(false);
  const [storageFeedback, setStorageFeedback] = useState('');

  const refreshStorageData = async () => {
    try {
      const stats = await getLocalCacheStats();
      setStorageStats(stats);
      const fStatus = await getLinkedFolderStatus();
      setFolderStatus(fStatus);
    } catch (e) {
      console.warn('Storage data refresh notice:', e);
    }
  };

  useEffect(() => {
    if (isOpen && currentView === 'storage') {
      refreshStorageData();
    }
  }, [isOpen, currentView]);

  const handleLinkFolder = async () => {
    setIsLinkingFolder(true);
    setStorageFeedback('');
    try {
      const res = await requestLinkMediaFolder();
      if (res.success) {
        setStorageFeedback(`Linked folder: ${res.folderName}`);
        refreshStorageData();
      }
    } catch (err) {
      setStorageFeedback(err.message || 'Folder selection aborted');
    } finally {
      setIsLinkingFolder(false);
    }
  };

  const handleUnlinkFolder = async () => {
    await unlinkMediaFolder();
    setStorageFeedback('Local folder unlinked');
    refreshStorageData();
  };

  const handleClearCache = async () => {
    const ok = window.confirm('Clear all locally cached photos, videos, and audio notes? Files will re-download when viewed again.');
    if (!ok) return;

    await clearLocalMediaCache();
    setStorageFeedback('Local media cache cleared!');
    refreshStorageData();
  };

  const myUid = currentUser?.uid;

  // Real-time Firestore Document State
  const [userDocData, setUserDocData] = useState(null);

  // 1. LISTEN TO CURRENT USER FIRESTORE DOCUMENT DIRECTLY
  useEffect(() => {
    if (!isOpen || !myUid) return;

    const userRef = doc(db, 'users', myUid);
    const unsub = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserDocData(data);
        }
      },
      (err) => console.warn('[Settings] Live snapshot notice:', err.message)
    );

    return () => unsub();
  }, [isOpen, myUid]);

  // 2. EXTRACT CONSOLIDATED PRIVACY SETTINGS (MULTI-FIELD FALLBACK)
  const privacySettings = useMemo(() => {
    const fromDoc = userDocData?.privacySettings || {};
    const fallback = currentUser?.privacySettings || {};

    // Combine blocked list from all possible schemas
    const blockedList = Array.from(
      new Set([
        ...(fromDoc.blockedUsers || []),
        ...(userDocData?.blockedUsers || []),
        ...(userDocData?.blocked || []),
        ...(fallback.blockedUsers || []),
        ...(currentUser?.blockedUsers || []),
        ...(currentUser?.blocked || []),
      ])
    ).filter(Boolean);

    return {
      lastSeen: fromDoc.lastSeen || fallback.lastSeen || 'everyone',
      lastSeenAllowed: fromDoc.lastSeenAllowed || fallback.lastSeenAllowed || [],
      onlineStatus: fromDoc.onlineStatus || fallback.onlineStatus || 'same_as_last_seen',
      profilePhoto: fromDoc.profilePhoto || fallback.profilePhoto || 'everyone',
      profilePhotoAllowed: fromDoc.profilePhotoAllowed || fallback.profilePhotoAllowed || [],
      about: fromDoc.about || fallback.about || 'everyone',
      aboutAllowed: fromDoc.aboutAllowed || fallback.aboutAllowed || [],
      readReceipts: fromDoc.readReceipts ?? fallback.readReceipts ?? true,
      statusAudience: fromDoc.statusAudience || fallback.statusAudience || 'everyone',
      disappearingDefault: fromDoc.disappearingDefault || fallback.disappearingDefault || 'off',
      appLockEnabled: fromDoc.appLockEnabled ?? fallback.appLockEnabled ?? false,
      appLockType: fromDoc.appLockType || fallback.appLockType || 'pin',
      appLockSecret: fromDoc.appLockSecret || fallback.appLockSecret || '',
      blockedUsers: blockedList,
    };
  }, [userDocData, currentUser]);

  const [blockedUsersDetails, setBlockedUsersDetails] = useState([]);

  // 3. FETCH & HYDRATE BLOCKED USERS PROFILES
  useEffect(() => {
    if (!isOpen) return;

    const blockedUids = privacySettings.blockedUsers || [];
    console.log('[Blocked Contacts Sync] Raw Blocked UIDs:', blockedUids);

    if (blockedUids.length === 0) {
      setBlockedUsersDetails([]);
      setLoadingBlocked(false);
      return;
    }

    let isMounted = true;
    setLoadingBlocked(true);

    const loadAllBlockedUsers = async () => {
      try {
        const details = await Promise.all(
          blockedUids.map(async (targetUid) => {
            try {
              const uSnap = await getDoc(doc(db, 'users', targetUid));
              if (uSnap.exists()) {
                const uData = uSnap.data();
                return {
                  uid: targetUid,
                  displayName: uData.displayName || uData.name || uData.username || 'Qwik User',
                  email: uData.email || '',
                  photoURL: uData.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUid}`,
                };
              }
            } catch (fetchErr) {
              console.warn(`[Blocked] Could not read user ${targetUid}:`, fetchErr.message);
            }

            // Resilient Fallback Card if getDoc fails
            return {
              uid: targetUid,
              displayName: `Blocked Contact (${targetUid.slice(0, 6)}...)`,
              email: targetUid,
              photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUid}`,
            };
          })
        );

        if (isMounted) {
          setBlockedUsersDetails(details);
        }
      } catch (err) {
        console.error('[Blocked] Hydration failure:', err);
      } finally {
        if (isMounted) setLoadingBlocked(false);
      }
    };

    loadAllBlockedUsers();

    return () => {
      isMounted = false;
    };
  }, [isOpen, privacySettings.blockedUsers]);

  // 4. CRASH-PROOF SETTING UPDATE HANDLER
  const handleUpdatePrivacy = async (key, value, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!myUid) return;

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);

    try {
      const userRef = doc(db, 'users', myUid);
      await setDoc(
        userRef,
        {
          privacySettings: {
            [key]: value,
          },
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[Privacy] Write note:', err.message);
    }
  };

  // 5. UNBLOCK USER HANDLER (SYNCHRONIZED MULTI-SCHEMA UNBLOCK)
  const handleUnblockUser = async (targetUid, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!myUid || !targetUid) return;

    // Optimistic UI Update
    setBlockedUsersDetails((prev) => prev.filter((u) => u.uid !== targetUid));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1500);

    // Sync to Firestore across both possible locations
    try {
      const userRef = doc(db, 'users', myUid);
      await setDoc(
        userRef,
        {
          blockedUsers: arrayRemove(targetUid),
          blocked: arrayRemove(targetUid),
          privacySettings: {
            blockedUsers: arrayRemove(targetUid),
          },
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[Privacy] Unblock sync warning:', err.message);
    }
  };

  // 5. SMART APP LOCK TOGGLE & VERIFICATION HANDLERS
  const handleAppLockToggle = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!privacySettings.appLockEnabled) {
      // TURNING ON:
      // Check if user ALREADY has a saved PIN/Password
      if (privacySettings.appLockSecret && String(privacySettings.appLockSecret).trim().length > 0) {
        // Instantly enable without asking for setup again!
        handleUpdatePrivacy('appLockEnabled', true, e);
      } else {
        // First time setup -> open SetLockModal
        setShowSetLockModal(true);
      }
    } else {
      // TURNING OFF:
      // Require verification of current PIN/Password first!
      if (privacySettings.appLockSecret && String(privacySettings.appLockSecret).trim().length > 0) {
        setShowVerifyModal(true);
      } else {
        // Fallback if no secret was ever stored
        handleUpdatePrivacy('appLockEnabled', false, e);
      }
    }
  };

  // Called when user successfully verifies current password to turn off
  const handleConfirmTurnOff = () => {
    handleUpdatePrivacy('appLockEnabled', false);
  };

  const handleSaveCustomLock = async (lockType, secretVal) => {
    if (!myUid) return;

    const updated = {
      ...privacySettings,
      appLockEnabled: true,
      appLockType: lockType,
      appLockSecret: secretVal,
      appPin: secretVal, // backwards-compatible
    };
    setPrivacySettings(updated);
    try {
      localStorage.setItem(`privacy_${myUid}`, JSON.stringify(updated));
    } catch {}

    try {
      const userRef = doc(db, 'users', myUid);
      await setDoc(
        userRef,
        {
          privacySettings: {
            appLockEnabled: true,
            appLockType: lockType,
            appLockSecret: secretVal,
            appPin: secretVal,
          },
        },
        { merge: true }
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.warn('[Privacy] Local lock updated:', err?.message || err);
    }
  };

  // Reset view to main when modal closes
  const handleClose = () => {
    sessionStorage.removeItem('qwik_active_settings_view');
    setCurrentViewState('main');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-[500] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-in fade-in duration-150 cursor-default"
    >
      {/* MODAL CARD: EVENT ISOLATION */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        
        {/* ========================================================= */}
        {/* VIEW 1: MAIN SETTINGS MENU                                */}
        {/* ========================================================= */}
        {currentView === 'main' && (
          <>
            {/* Header */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-950 via-teal-950/20 to-gray-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30">
                  <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-white">App Settings</h3>
                  <p className="text-[11px] text-gray-400 font-medium">Preferences & configuration</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-900 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Menu Options */}
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              {/* 1. PRIVACY & SECURITY TILE */}
              <div
                onClick={() => setCurrentView('privacy')}
                className="p-4 rounded-2xl bg-gray-900/60 hover:bg-gray-900 border border-gray-800 hover:border-teal-500/40 flex items-center justify-between cursor-pointer transition-all group shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 group-hover:scale-105 transition-transform">
                    <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white group-hover:text-teal-400 transition-colors">
                      Privacy & Security
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Last Seen, Read Receipts, Blocked Users, App Lock
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-gray-500 group-hover:text-teal-400">
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-400/80 bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-500/20">
                    Enterprise
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* 2. STORAGE & LOCAL MEDIA TILE */}
              <div
                onClick={() => setCurrentView('storage')}
                className="p-4 rounded-2xl bg-gray-900/60 hover:bg-gray-900 border border-gray-800 hover:border-teal-500/40 flex items-center justify-between cursor-pointer transition-all group shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 group-hover:scale-105 transition-transform">
                    <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16m-7 4h2" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white group-hover:text-teal-400 transition-colors">
                      Storage & Local Media
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Smart local media detection, folder access, offline cache
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-gray-500 group-hover:text-teal-400">
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-400/80 bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-500/20">
                    Offline
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Profile Card Summary */}
              <div className="p-4 rounded-2xl bg-gray-900/40 border border-gray-800/80 flex items-center gap-3.5">
                <img
                  src={currentUser?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser?.uid}`}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border-2 border-teal-500/30"
                />
                <div className="min-w-0">
                  <h5 className="text-xs font-black text-white truncate">{currentUser?.displayName || 'User'}</h5>
                  <p className="text-[10px] text-gray-400 truncate">{currentUser?.email}</p>
                  <span className="inline-block mt-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    Online & Synchronized
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-950 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold transition-colors cursor-pointer border border-gray-800"
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: STORAGE & LOCAL MEDIA MANAGEMENT                  */}
        {/* ========================================================= */}
        {currentView === 'storage' && (
          <>
            {/* Header */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-950 via-teal-950/20 to-gray-950">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('main')}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-900 transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h3 className="text-base font-black text-white">Storage & Local Media</h3>
                  <p className="text-[11px] text-gray-400 font-medium">Smart detection, folder access, offline reuse</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-900 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Storage Body */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {/* Feedback Alert */}
              {storageFeedback && (
                <div className="p-3 rounded-xl bg-teal-950/60 border border-teal-500/40 text-teal-300 text-xs font-semibold flex items-center justify-between">
                  <span>{storageFeedback}</span>
                  <button onClick={() => setStorageFeedback('')} className="text-teal-400 hover:text-white">✕</button>
                </div>
              )}

              {/* 1. Storage Usage Overview */}
              <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-teal-400">Local Media Cache</h4>
                  <span className="text-[11px] font-mono font-bold text-gray-300">
                    {storageStats ? `${(storageStats.totalBytes / (1024 * 1024)).toFixed(2)} MB` : 'Calculating...'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-xs font-bold text-white">{storageStats?.photoCount ?? 0}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">📷 Photos</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-xs font-bold text-white">{storageStats?.videoCount ?? 0}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">🎥 Videos</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                    <div className="text-xs font-bold text-white">{storageStats?.audioCount ?? 0}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">🎵 Audio</div>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                  Media you send or download is indexed in high-performance browser storage so it opens instantly without downloading again.
                </p>
              </div>

              {/* 2. Device Storage & Folder Linking */}
              <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-white">Device Folder Access</h4>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                    folderStatus?.isLinked ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {folderStatus?.isLinked ? 'Linked' : 'Not Linked'}
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Allow Qwik-Messages to check an authorized device folder (such as Downloads or Pictures) for photos, videos, and voice notes. If an exact matching file is found, it plays immediately without re-downloading.
                </p>

                {isFileSystemAccessSupported() ? (
                  <div className="pt-1 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={isLinkingFolder}
                      onClick={handleLinkFolder}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-gray-950 text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      <span>{folderStatus?.isLinked ? 'Change Authorized Folder' : 'Link Device Media Folder'}</span>
                    </button>

                    {folderStatus?.isLinked && (
                      <button
                        type="button"
                        onClick={handleUnlinkFolder}
                        className="py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-rose-300 text-xs font-bold transition-all cursor-pointer"
                      >
                        Unlink Folder
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800 text-[11px] text-gray-400">
                    ℹ️ Device folder linking requires the File System Access API (supported on desktop Chrome, Edge, and Opera). On mobile or standard browsers, Qwik-Messages automatically uses persistent IndexedDB caching for all downloaded media.
                  </div>
                )}
              </div>

              {/* 3. Cache Management Actions */}
              <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-white">Clear Local Media Cache</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">Free up browser storage by clearing locally cached media.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/50 text-rose-300 hover:text-rose-200 text-xs font-black transition-all cursor-pointer shrink-0"
                >
                  Clear Cache
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentView('main')}
                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold transition-colors cursor-pointer border border-gray-800 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer shadow-lg shadow-teal-500/20"
              >
                Done
              </button>
            </div>
          </>
        )}
        
        {currentView === 'privacy' && (
          <>
            {/* Header with Back Button */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-950 via-teal-950/20 to-gray-950">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('main')}
                  className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 transition-colors cursor-pointer"
                  title="Back to Settings"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h3 className="text-base font-black text-white">Privacy & Security</h3>
                  <p className="text-[11px] text-gray-400 font-medium">Enterprise data protection & visibility</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-[11px] font-bold text-teal-400 bg-teal-950/80 px-2.5 py-1 rounded-full border border-teal-500/30 animate-pulse">
                    ✓ Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-900 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Privacy Tabs */}
            <div className="flex items-center px-5 border-b border-gray-800 bg-gray-950/60 gap-4 text-xs font-bold">
              {[
                { id: 'general', label: 'Visibility & Receipts' },
                { id: 'blocked', label: `Blocked Contacts (${privacySettings.blockedUsers?.length || 0})` },
                { id: 'security', label: 'App Lock & Security' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPrivacyTab(tab.id)}
                  className={`py-3.5 border-b-2 transition-all cursor-pointer ${
                    privacyTab === tab.id
                      ? 'border-teal-400 text-teal-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Privacy Tab Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* TAB 1: VISIBILITY */}
              {privacyTab === 'general' && (
                <div className="space-y-4">
                  {/* READ RECEIPTS */}
                  <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 flex items-center justify-between">
                    <div className="pr-4">
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                        <span>Read Receipts</span>
                        <span className="text-teal-400 font-bold">✓✓</span>
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        If turned off, you won't send or receive read receipts. Blue ticks will remain inactive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleUpdatePrivacy('readReceipts', !privacySettings.readReceipts, e)}
                      className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                        privacySettings.readReceipts ? 'bg-teal-500 shadow-lg shadow-teal-500/20' : 'bg-gray-800'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                          privacySettings.readReceipts ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 4-OPTION PRIVACY FIELDS (Last Seen, Profile Photo, About) */}
                  {['lastSeen', 'profilePhoto', 'about'].map((field) => {
                    const titles = {
                      lastSeen: 'Who can see my Last Seen',
                      profilePhoto: 'Who can see my Profile Photo',
                      about: 'Who can see my About info',
                    };
                    const currentVal = privacySettings[field] || 'everyone';
                    const allowedListKey = `${field}Allowed`;
                    const allowedUids = privacySettings[allowedListKey] || [];

                    return (
                      <div key={field} className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-3">
                        <h4 className="text-xs font-black text-white">{titles[field]}</h4>
                        
                        {/* 4-Column Grid for Everyone, Contacts, Nobody, Specific */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {['everyone', 'contacts', 'nobody', 'specific'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={(e) => {
                                handleUpdatePrivacy(field, opt, e);
                                if (opt === 'specific') {
                                  setActiveSpecificModal(field);
                                }
                              }}
                              className={`py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                                currentVal === opt
                                  ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                                  : 'bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                              }`}
                            >
                              {opt === 'contacts' ? 'My Contacts' : opt}
                            </button>
                          ))}
                        </div>

                        {/* Configure Button if 'specific' is active */}
                        {currentVal === 'specific' && (
                          <div className="pt-2 flex items-center justify-between border-t border-gray-800/60">
                            <span className="text-[11px] text-teal-400 font-medium">
                              {allowedUids.length} contacts selected
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveSpecificModal(field)}
                              className="px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all cursor-pointer"
                            >
                              Configure Specific Contacts
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* DEFAULT DISAPPEARING TIMER */}
                  <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-3">
                    <div>
                      <h4 className="text-xs font-black text-white">Default Message Timer</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Start new chats with disappearing messages enabled</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'off', label: 'Off' },
                        { id: '24h', label: '24 Hours' },
                        { id: '7d', label: '7 Days' },
                        { id: '90d', label: '90 Days' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={(e) => handleUpdatePrivacy('disappearingDefault', opt.id, e)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            privacySettings.disappearingDefault === opt.id
                              ? 'bg-teal-500 text-gray-950 shadow-md shadow-teal-500/20'
                              : 'bg-gray-800/80 hover:bg-gray-800 text-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BLOCKED CONTACTS */}
              {privacyTab === 'blocked' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-teal-950/20 border border-teal-500/30 text-[11px] text-teal-300 font-medium">
                    Blocked contacts cannot send you messages, view your status updates, or call you.
                  </div>

                  {loadingBlocked ? (
                    <div className="py-12 text-center text-gray-500 animate-pulse text-xs font-bold">
                      Loading blocked contacts...
                    </div>
                  ) : blockedUsersDetails.length > 0 ? (
                    <div className="divide-y divide-gray-800 border border-gray-800 rounded-2xl bg-gray-900/50 overflow-hidden">
                      {blockedUsersDetails.map((user) => (
                        <div key={user.uid} className="p-3.5 flex items-center justify-between hover:bg-gray-900/80 transition-colors">
                          <div className="flex items-center gap-3">
                            <img
                              src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover border border-gray-700 bg-gray-800"
                            />
                            <div>
                              <h5 className="text-xs font-bold text-white">
                                {user.displayName || user.name || 'User'}
                              </h5>
                              <span className="text-[10px] text-gray-500">{user.email || user.uid}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleUnblockUser(user.uid, e)}
                            className="px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95"
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-gray-500">
                      <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-3 border border-gray-800 text-gray-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      </div>
                      <p className="text-xs font-bold text-gray-300">No Blocked Contacts</p>
                      <p className="text-[11px] text-gray-500 mt-1">Users you block will appear here.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: APP LOCK & ENCRYPTION */}
              {privacyTab === 'security' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950/40 via-emerald-950/30 to-gray-900 border border-teal-500/40 flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/40">
                      <svg className="w-6 h-6 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white">End-to-End Encryption Active</h4>
                      <p className="text-[11px] text-gray-300 mt-0.5">Your personal messages and media are secured with 256-bit AES cryptographic protocols.</p>
                    </div>
                  </div>

                  {/* APP LOCK & IN-APP PIN SETUP BOX */}
                  <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800/80 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-black text-white">App Lock Protection</h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Require 4-digit PIN or Password when opening Qwik Messages
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAppLockToggle}
                        className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                          privacySettings.appLockEnabled ? 'bg-teal-500 shadow-lg shadow-teal-500/20' : 'bg-gray-800'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                            privacySettings.appLockEnabled ? 'translate-x-5.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {privacySettings.appLockEnabled && (
                      <div className="pt-3 border-t border-gray-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-300 font-bold">Lock Type:</span>
                          <span className="text-xs font-mono text-teal-400 bg-teal-950/60 px-2.5 py-0.5 rounded-lg border border-teal-500/30 uppercase font-black">
                            {privacySettings.appLockType === 'password' ? 'Password' : '4-Digit PIN'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowSetLockModal(true)}
                          className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-teal-400 border border-teal-500/30 text-xs font-bold transition-all cursor-pointer hover:scale-105"
                        >
                          Change PIN / Password
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentView('main')}
                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs font-bold transition-colors cursor-pointer border border-gray-800 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-gray-950 text-xs font-black hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer shadow-lg shadow-teal-500/20"
              >
                Done
              </button>
            </div>
          </>
        )}

      </div>

      {/* 1. SET / CHANGE LOCK MODAL */}
      <SetLockModal
        isOpen={showSetLockModal}
        onClose={() => setShowSetLockModal(false)}
        onSave={handleSaveCustomLock}
        currentType={privacySettings.appLockType || 'pin'}
      />

      {/* 2. VERIFY LOCK BEFORE TURNING OFF MODAL */}
      <VerifyLockModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerified={handleConfirmTurnOff}
        targetSecret={privacySettings.appLockSecret || privacySettings.appPin || '1234'}
        lockType={privacySettings.appLockType || 'pin'}
      />

      {/* 3. SPECIFIC CONTACTS EXCEPTION MODAL */}
      <SpecificContactsModal
        isOpen={Boolean(activeSpecificModal)}
        onClose={() => setActiveSpecificModal(null)}
        title={
          activeSpecificModal === 'lastSeen'
            ? 'Last Seen Exceptions'
            : activeSpecificModal === 'profilePhoto'
            ? 'Profile Photo Exceptions'
            : 'About Info Exceptions'
        }
        currentAllowed={privacySettings[`${activeSpecificModal}Allowed`] || []}
        onSave={(selectedUids) => {
          if (activeSpecificModal) {
            handleUpdatePrivacy(`${activeSpecificModal}Allowed`, selectedUids);
          }
        }}
        currentUserUid={myUid}
      />
    </div>
  );
}
