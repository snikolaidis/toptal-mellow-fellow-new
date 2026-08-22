import {
  createContext,
  useContext,
  ReactNode,
} from 'react';

import {
  useAuth as useFaustAuth,
} from '@faustwp/core';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  isReady: boolean;
}

const AuthContext =
  createContext<AuthContextValue>({
    isAuthenticated: null,
    isReady: false,
  });

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    isAuthenticated,
    isReady,
  } = useFaustAuth();

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}