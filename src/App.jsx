import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import LoginScreen from './components/auth/LoginScreen';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from './firebaseConfig';
import AccountMergeModal from './components/auth/AccountMergeModal';
import AppLockScreen from './components/AppLockScreen';
import UnderConstructionModal from './components/UnderConstructionModal';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { qrProfileService } from './services/qrProfileService';
import ShowQRCodeModal from './components/profile/ShowQRCodeModal';

// ✅ REFACTOR: MainLayoutWrapper declared OUTSIDE AppContent to prevent remounts
function MainLayoutWrapper() {
  const { previewImage, setPreviewImage, setActiveChat } = useChat();
  const { currentUser, userProfile } = useAuth();
  const [showQRDirectModal, setShowQRDirectModal] = React.useState(false);

  // Deep-link detection for ?friend_uid= or ?add_friend=
  React.useEffect(() => {
    if (!currentUser?.uid) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const friendUid = urlParams.get('friend_uid') || urlParams.get('add_friend');
      if (friendUid && friendUid !== currentUser.uid) {
        qrProfileService.resolveProfileByUid(friendUid, currentUser.uid).then((res) => {
          if (res.success && res.user) {
            const shouldAdd = window.confirm(
              `Add ${res.user.displayName || 'this user'} (@${(res.user.username || '').replace(/^@/, '')}) as a friend on Qwik Messages?`
            );
            if (shouldAdd) {
              qrProfileService.confirmAndAddFriend(currentUser, res.user).then((activeRoom) => {
                setActiveChat(activeRoom);
              }).catch((e) => console.error("Confirm friend failed:", e));
            }
          } else if (res.error) {
            alert(res.error);
          }
          // Clean URL params without reloading
          window.history.replaceState({}, document.title, window.location.pathname);
        });
      }
    } catch (e) {
      console.warn("Friend deep-link resolution notice:", e);
    }
  }, [currentUser?.uid, setActiveChat]);

  return (
    <>
      <MainLayout />
      <AccountMergeModal />
      <ShowQRCodeModal
        isOpen={showQRDirectModal}
        onClose={() => setShowQRDirectModal(false)}
        currentUser={currentUser}
        userProfile={userProfile}
      />
      
      {/* Qwik Immersive Media Viewer */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-lg animate-fade-in cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
          {/* Top Bar with Action Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-4 z-[10000]">
            <button 
              onClick={() => setPreviewImage(null)}
              className="text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 p-3 rounded-full transition-all border border-slate-750 shadow-lg cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Immersive Responsive Image Stage */}
          <div 
            className="w-full h-full max-w-[95vw] max-h-[90vh] flex items-center justify-center p-4 transition-all duration-300 scale-up-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={previewImage} 
              alt="Avatar HD Preview" 
              className="max-w-full max-h-full w-auto h-auto md:max-w-[70vw] md:max-h-[80vh] object-contain rounded-xl shadow-2xl border border-slate-900 select-none pointer-events-auto" 
            />
          </div>
        </div>
      )}
    </>
  );
}

function AppContent() {
  const { currentUser, userProfile } = useAuth();
  useSessionTimeout(currentUser);
  const [hasAcceptedRebuild, setHasAcceptedRebuild] = React.useState(false);
  
  // 1. IN-MEMORY UNLOCK STATE (Strictly resets to false on every page refresh)
  const [isUnlocked, setIsUnlocked] = React.useState(false);
  
  const [copied, setCopied] = React.useState(false);
  const supportEmail = "qwik.messages.official@gmail.com";

  // 2. SYNCHRONOUSLY READ INITIAL PRIVACY SETTINGS FROM CACHE TO AVOID FLASH
  const cachedSettings = React.useMemo(() => {
    try {
      const uid = currentUser?.uid;
      if (!uid) return null;
      const cached = localStorage.getItem(`privacy_${uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }, [currentUser?.uid]);

  const privacySettings = userProfile?.privacySettings || currentUser?.privacySettings || cachedSettings;
  const appLockEnabled = Boolean(privacySettings?.appLockEnabled);

  const handleEmailClick = (e) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Magic Link Verification Handler on mount
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      
      if (!email) {
        email = window.prompt('Please confirm your email address to complete sign-in:');
      }

      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            console.log('🎉 Successfully signed in with Magic Link!', result.user);
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => {
            console.error('🚨 Magic Link Verification Failed:', err);
            alert('This sign-in link has expired or is invalid. Please request a new one.');
          });
      }
    }
  }, []);

  if (!currentUser) {
    return <LoginScreen />;
  }

  if (!hasAcceptedRebuild) {
    return (
      <UnderConstructionModal
        isOpen={!hasAcceptedRebuild}
        onClose={() => setHasAcceptedRebuild(true)}
      />
    );
  }

  return (
    <ChatProvider>
      <CallProvider>
        {appLockEnabled && !isUnlocked ? (
          <AppLockScreen
            currentUser={currentUser}
            privacySettings={privacySettings}
            onUnlock={() => setIsUnlocked(true)}
          />
        ) : (
          <MainLayoutWrapper />
        )}
      </CallProvider>
    </ChatProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
