import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery, useMutation } from '@apollo/client';
import { GET_LOYALTY_REDEMPTION, REDEEM_LOYALTY_OPTION } from '@/graphql/queries/auth';
import { useCart } from '@/context/CartContext';

interface Option {
  id: number;
  name: string;
  points: number;
  costText: string;
  isVariable?: boolean;
  isFreeProduct?: boolean;
}

const PolicyLink = () => (
  <p className="loyalty-checkout__policy">
    Having issues redeeming? See our <Link href="/pages/rewards-policy">policy page</Link> for
    details.
  </p>
);

export default function LoyaltyCheckoutRewards() {
  const { isReady, isAuthenticated } = useAuth();
  const client = getApolloAuthClient();
  const { data, loading, refetch } = useQuery(GET_LOYALTY_REDEMPTION, {
    client,
    skip: !isReady || !isAuthenticated,
  });
  const [redeem] = useMutation(REDEEM_LOYALTY_OPTION, { client });
  const { applyCoupon, cart } = useCart();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!appliedCode || !cart) {
      return;
    }
    const codes = (cart.appliedCoupons ?? []).map((c) => c.code.toLowerCase());
    if (!codes.includes(appliedCode.toLowerCase())) {
      setAppliedCode(null);
      refetch();
    }
  }, [cart, appliedCode, refetch]);

  if (!isReady) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="loyalty-checkout">
        <p className="loyalty-checkout__guest">
          Don&apos;t miss out! <Link href="/login">Log in</Link> to earn rewards.
        </p>
      </div>
    );
  }

  const info = data?.loyaltyRedemption;
  if (loading || !info?.authenticated) {
    return null;
  }

  const points: number = info.pointsBalance ?? 0;
  const options: Option[] = (info.options ?? []).filter(
    (o: Option) => !o.isVariable && !o.isFreeProduct
  );
  if (options.length === 0) {
    return null;
  }

  const affordable = options.filter((o) => points >= o.points);
  if (affordable.length === 0) {
    const cheapest = Math.min(...options.map((o) => o.points));
    return (
      <div className="loyalty-checkout">
        <p className="loyalty-checkout__away">
          You&apos;re {cheapest - points} points away from a reward.
        </p>
        <PolicyLink />
      </div>
    );
  }

  const activeId = selectedId ?? affordable[affordable.length - 1].id;

  const handleApply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await redeem({ variables: { optionId: activeId } });
      const payload = res.data?.redeemLoyaltyOption;
      if (payload?.success && payload.code) {
        const ok = await applyCoupon(payload.code);
        if (ok) {
          setAppliedCode(payload.code);
          refetch();
        } else {
          setError('Reward code could not be applied to your cart.');
        }
      } else {
        setError(payload?.message || 'Could not redeem. Please try again.');
      }
    } catch {
      setError('Could not redeem. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="loyalty-checkout">
      <p className="loyalty-checkout__balance">You have {points} points</p>

      {appliedCode ? (
        <p className="loyalty-checkout__applied">Reward applied at checkout: {appliedCode}</p>
      ) : (
        <div className="loyalty-checkout__row">
          <select
            className="loyalty-checkout__select"
            value={activeId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            aria-label="Rewards"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id} disabled={points < o.points}>
                {o.name} for {o.points} points
              </option>
            ))}
          </select>
          <button
            type="button"
            className="loyalty-checkout__apply"
            onClick={handleApply}
            disabled={busy}
          >
            {busy ? 'Applying...' : 'Apply'}
          </button>
        </div>
      )}

      {error && <p className="loyalty-checkout__error">{error}</p>}
      <PolicyLink />
    </div>
  );
}
