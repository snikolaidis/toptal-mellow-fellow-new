import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  isReady: boolean;
  userId: number | null;
  logout: (redirectTo?: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: null,
  isReady: false,
  userId: null,
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIsAuthenticated(data.authenticated ?? false);
        setUserId(data.userId ?? null);
        setIsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAuthenticated(false);
        setUserId(null);
        setIsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback((redirectTo?: string) => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .finally(() => {
        window.location.assign(redirectTo || '/');
      });
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isReady, userId, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
