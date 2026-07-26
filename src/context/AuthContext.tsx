import { createContext, useContext, ReactNode } from 'react';
import { useAuth as useFaustAuth } from '@faustwp/core';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({ isAuthenticated: null, isReady: false });

// Faust's own useAuth() hits /api/faust/auth/token on every mount with no
// shared state between instances - every component that called it directly
// fired its own duplicate request (and its own 401 for guests). This provider
// calls it exactly once and shares the result via context instead.
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isReady } = useFaustAuth();
  return <AuthContext.Provider value={{ isAuthenticated, isReady }}>{children}</AuthContext.Provider>;
}
