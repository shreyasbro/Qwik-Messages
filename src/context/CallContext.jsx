import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useCallManager } from '../hooks/useCallManager';

const CallContext = createContext();

export function CallProvider({ children }) {
  const { currentUser } = useAuth();
  const callManager = useCallManager(currentUser);

  return (
    <CallContext.Provider value={callManager}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
