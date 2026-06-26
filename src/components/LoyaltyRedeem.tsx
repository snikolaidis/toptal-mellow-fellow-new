import { useState } from 'react';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery, useMutation } from '@apollo/client';
import { GET_LOYALTY_REDEMPTION, REDEEM_LOYALTY_OPTION } from '@/graphql/queries/auth';
import { useCart } from '@/context/CartContext';
import LoyaltyRedeemView, { RedemptionOption } from './LoyaltyRedeemView';

export default function LoyaltyRedeem() {
  const { isAuthenticated, isReady } = useAuth();
  const client = getApolloAuthClient();
  const { addToCart, applyCoupon } = useCart();
  const { data, loading, refetch } = useQuery(GET_LOYALTY_REDEMPTION, {
    client,
    skip: !isReady || !isAuthenticated,
  });
  const [redeem] = useMutation(REDEEM_LOYALTY_OPTION, { client });
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const info = data?.loyaltyRedemption;
  const points = info?.pointsBalance ?? 0;
  const options: RedemptionOption[] = info?.options ?? [];

  const handleRedeem = async (optionId: number, pointsToRedeem?: number) => {
    setError(null);
    setCode(null);
    setBusyId(optionId);
    try {
      const res = await redeem({ variables: { optionId, pointsToRedeem } });
      const payload = res.data?.redeemLoyaltyOption;
      if (payload?.success && payload.code) {
        if (payload.productId) {
          await addToCart({ productId: Number(payload.productId), quantity: 1 });
          await applyCoupon(payload.code);
        }
        setCode(payload.code);
        refetch();
      } else {
        setError(payload?.message || 'Could not redeem. Please try again.');
      }
    } catch (e) {
      setError('Could not redeem. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isReady || !isAuthenticated || loading) {
    return null;
  }
  if (!info?.authenticated || options.length === 0) {
    return null;
  }

  return (
    <LoyaltyRedeemView
      points={points}
      options={options}
      code={code}
      error={error}
      busyId={busyId}
      onRedeem={handleRedeem}
    />
  );
}
