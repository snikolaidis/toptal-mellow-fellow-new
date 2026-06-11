import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import { GET_LOYALTY_IDENTITY } from '@/graphql/queries/auth';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

interface LoyaltyIdentity {
  authenticated: boolean;
  email: string | null;
  id: string | null;
  token: string | null;
  tags: string | null;
}

interface YotpoLoyaltyContextValue {
  ready: boolean;
  token: string | null;
}

const YotpoLoyaltyContext = createContext<YotpoLoyaltyContextValue>({ ready: false, token: null });

export function useYotpoLoyalty(): YotpoLoyaltyContextValue {
  return useContext(YotpoLoyaltyContext);
}

export function YotpoLoyaltyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isReady } = useAuth();
  const [mounted, setMounted] = useState(false);
  const client = getApolloAuthClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, loading } = useQuery<{ loyaltyIdentity: LoyaltyIdentity }>(GET_LOYALTY_IDENTITY, {
    client,
    skip: !isReady || !isAuthenticated,
  });

  const identity = data?.loyaltyIdentity;
  const token = identity?.token ?? null;
  const ready = mounted && isReady && (!isAuthenticated || !loading);

  useEffect(() => {
    if (ready) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token]);

  return (
    <YotpoLoyaltyContext.Provider value={{ ready, token }}>
      {mounted && identity?.authenticated && token && (
        <div
          id="swell-customer-identification"
          data-authenticated="true"
          data-email={identity.email ?? ''}
          data-id={identity.id ?? ''}
          data-token={token}
          data-tags={identity.tags ?? '[]'}
          style={{ display: 'none' }}
          suppressHydrationWarning
        />
      )}
      {children}
    </YotpoLoyaltyContext.Provider>
  );
}
