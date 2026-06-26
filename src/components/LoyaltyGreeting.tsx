import Link from 'next/link';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import { GET_LOYALTY_PROGRAM } from '@/graphql/queries/auth';

export default function LoyaltyGreeting() {
  const { isAuthenticated, isReady } = useAuth();
  const client = getApolloAuthClient();
  const { data, loading } = useQuery(GET_LOYALTY_PROGRAM, {
    client,
    skip: !isReady || !isAuthenticated,
  });

  if (!isReady || !isAuthenticated || loading) {
    return null;
  }

  const info = data?.loyaltyProgram;
  if (!info?.authenticated) {
    return null;
  }

  const name = info.firstName || 'there';
  const points = info.pointsBalance ?? 0;
  const tier = info.currentTier || '';
  const tierLabel = tier ? (tier.toLowerCase().includes('tier') ? tier : `${tier} tier`) : '';

  return (
    <div className="loyalty-greeting">
      <h2 className="loyalty-greeting__title">Hi {name}!</h2>
      <p className="loyalty-greeting__meta">
        {points} points{tierLabel ? ` | ${tierLabel}` : ''}
      </p>
      <div className="loyalty-greeting__actions">
        <Link href="/pages/rewards" className="loyalty-greeting__btn loyalty-greeting__btn--solid">
          Redeem points
        </Link>
        <Link href="/account" className="loyalty-greeting__btn">
          Rewards history
        </Link>
      </div>
    </div>
  );
}
