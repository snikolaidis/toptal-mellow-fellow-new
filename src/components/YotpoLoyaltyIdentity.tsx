import { useEffect, useState } from 'react';
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

export default function YotpoLoyaltyIdentity() {
  const { isAuthenticated, isReady } = useAuth();
  const [mounted, setMounted] = useState(false);
  const client = getApolloAuthClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data } = useQuery<{ loyaltyIdentity: LoyaltyIdentity }>(GET_LOYALTY_IDENTITY, {
    client,
    skip: !isReady || !isAuthenticated,
  });

  const identity = data?.loyaltyIdentity;
  const token = identity?.token;

  useEffect(() => {
    if (mounted && token) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [mounted, token]);

  if (!mounted || !identity?.authenticated || !token) {
    return null;
  }

  return (
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
  );
}
