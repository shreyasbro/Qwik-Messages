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
import { useSessionTimeout } from './hooks/useSessionTimeout';

function AppContent() {
  const { currentUser } = useAuth();
  useSessionTimeout(currentUser);
  const [hasAcceptedRebuild, setHasAcceptedRebuild] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const supportEmail = "qwik.messages.official@gmail.com";

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
      <div className="fixed inset-0 z-[1000000] w-full h-[100dvh] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-fade-in">
        <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center animate-scale-up">
          {/* Header Accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 blur-sm"></div>
          
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6">
            <span className="text-2xl">🛠️</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mb-3">WEBSITE UNDER CONSTRUCTION</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-2">
            This website is currently rebuilding and undergoing some upgrades. Thank you for your patience!
          </p>

          {/* ✅ SMART ENTERPRISE FEEDBACK BLOCK: Handles PC Clipboard Copy + Mobile Mailto */}
          <div className="mt-3 text-center px-2 w-full select-none">
            <p className="text-[11px] text-slate-400 leading-normal">
              If you have any problems or want to give feedback, email us at:
            </p>
            
            <div className="flex flex-col items-center justify-center mt-1">
              <a 
                href={`mailto:${supportEmail}?subject=Qwik%20Messages%20-%20Support/Feedback`}
                onClick={handleEmailClick}
                title="Click to copy email & open mail client"
                className="inline-block text-[11px] md:text-xs font-bold text-teal-400 hover:text-teal-300 underline underline-offset-4 whitespace-nowrap tracking-wide transition-colors duration-150 cursor-pointer pointer-events-auto"
              >
                {supportEmail}
              </a>

              {/* Dynamic PC Fallback Visual Toast */}
              <div className="h-4 mt-1 flex items-center justify-center">
                {copied && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-fade-in-up tracking-wider shadow-sm">
                    ✅ Copied to clipboard!
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setHasAcceptedRebuild(true)}
            className="w-full mt-5 py-4 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-sm uppercase rounded-xl transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
          >
            Ok, Let's Chat!
          </button>
        </div>
      </div>
    );
  }

function MainLayoutWrapper() {
  const { previewImage, setPreviewImage } = useChat();
  return (
    <>
      <MainLayout />
      <AccountMergeModal />
      
      {/* ✅ REFACTOR: WhatsApp/Instagram Style Immersive Media Viewer */}
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

  return (
    <ChatProvider>
      <CallProvider>
        <MainLayoutWrapper />
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
