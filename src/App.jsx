import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import LoginScreen from './components/auth/LoginScreen';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

function AppContent() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <LoginScreen />;
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
