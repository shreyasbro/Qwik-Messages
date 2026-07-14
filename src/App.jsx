import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import LoginScreen from './components/auth/LoginScreen';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

function AppContent() {
  const { currentUser } = useAuth();
  const [hasAcceptedRebuild, setHasAcceptedRebuild] = React.useState(false);

  if (!currentUser) {
    return <LoginScreen />;
  }

  if (!hasAcceptedRebuild) {
    return (
      <div className="fixed inset-0 z-[1000000] w-screen h-[100dvh] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-fade-in">
        <div className="w-full max-w-md bg-[#0B111E] border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center animate-scale-up">
          {/* Header Accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 blur-sm"></div>
          
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6">
            <span className="text-2xl">🛠️</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mb-3">WEBSITE UNDER CONSTRUCTION</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-8">
            This website is currently rebuilding and undergoing some upgrades. Thank you for your patience!
          </p>

          <button
            onClick={() => setHasAcceptedRebuild(true)}
            className="w-full py-4 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-sm uppercase rounded-xl transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
          >
            Ok, Let's Chat!
          </button>
        </div>
      </div>
    );
  }

  return (
    <ChatProvider>
      <CallProvider>
        <MainLayout />
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
