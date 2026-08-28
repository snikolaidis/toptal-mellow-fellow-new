import {
  createContext,
  useContext,
  ReactNode,
} from 'react';

import {
  useAuth as useFaustAuth,
  useLogout,
} from '@faustwp/core';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  isReady: boolean;
  logout: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue>({
    isAuthenticated: null,
    isReady: false,
    logout: async () => {},
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

  const { logout: faustLogout } = useLogout();

  const logout = async () => {
    try {
      // Clear Google session.
      await fetch('/api/auth/google-session-clear', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});

      // Existing cart/session cleanup.
      await fetch('/api/cart/save-for-user', {
        method: 'POST',
      }).catch(() => {});

      await fetch('/api/cart/clear-session', {
        method: 'POST',
      }).catch(() => {});

      // Existing Faust / Mellow Fellow logout.
      faustLogout('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isReady,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}