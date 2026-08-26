import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/router';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  isReady: boolean;
  userId: number | null;
  authenticate: (uid: number, expiresIn: number) => void;
  logout: (redirectTo?: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: null,
  isReady: false,
  userId: null,
  authenticate: () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max((expiresInSeconds - 60) * 1000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (data.success && data.expiresIn) {
          scheduleRefresh(data.expiresIn);
        } else {
          setIsAuthenticated(false);
          setUserId(null);
        }
      } catch {
        setIsAuthenticated(false);
        setUserId(null);
      }
    }, delay);
  }, []);

  const authenticate = useCallback((uid: number, expiresIn: number) => {
    setIsAuthenticated(true);
    setUserId(uid);
    setIsReady(true);
    scheduleRefresh(expiresIn);
  }, [scheduleRefresh]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setIsAuthenticated(data.authenticated ?? false);
        setUserId(data.userId ?? null);
        setIsReady(true);
        if (data.authenticated && data.expiresIn) {
          scheduleRefresh(data.expiresIn);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsAuthenticated(false);
        setUserId(null);
        setIsReady(true);
      });
    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  const logout = useCallback((redirectTo?: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setIsAuthenticated(false);
    setUserId(null);
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .finally(() => {
        router.push(redirectTo || '/');
      });
  }, [router]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isReady, userId, authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
