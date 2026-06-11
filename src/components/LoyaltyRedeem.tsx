import { useState } from 'react';
import { useAuth, getApolloAuthClient } from '@faustwp/core';
import { useQuery, useMutation } from '@apollo/client';
import { GET_LOYALTY_REDEMPTION, REDEEM_LOYALTY_OPTION } from '@/graphql/queries/auth';

interface RedemptionOption {
  id: number;
  name: string;
  points: number;
  costText: string;
}

export default function LoyaltyRedeem() {
  const { isAuthenticated, isReady } = useAuth();
  const client = getApolloAuthClient();
  const { data, loading, refetch } = useQuery(GET_LOYALTY_REDEMPTION, {
    client,
    skip: !isReady || !isAuthenticated,
  });
  const [redeem, { loading: redeeming }] = useMutation(REDEEM_LOYALTY_OPTION, { client });
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const info = data?.loyaltyRedemption;
  const points = info?.pointsBalance ?? 0;
  const options: RedemptionOption[] = info?.options ?? [];

  const handleRedeem = async (optionId: number) => {
    setError(null);
    setCode(null);
    setBusyId(optionId);
    try {
      const res = await redeem({ variables: { optionId } });
      const payload = res.data?.redeemLoyaltyOption;
      if (payload?.success && payload.code) {
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
    <div className="mt-8 border border-[#e0e0e0] p-6">
      <h2 className="text-lg font-semibold text-black mb-2">Redeem your points</h2>
      <p className="text-[#666666] mb-4">You have {points} points.</p>

      {code && (
        <div className="mb-4 p-4 bg-[#f5f5f0] border border-black">
          <p className="text-black font-medium">Your reward code:</p>
          <p className="text-xl font-bold tracking-wider text-black mt-1">{code}</p>
          <p className="text-sm text-[#666666] mt-1">Apply this code at checkout.</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-white border border-[#e0e0e0] text-[#999999]">{error}</div>
      )}

      <div className="space-y-3">
        {options.map((o) => {
          const affordable = points >= o.points;
          return (
            <div
              key={o.id}
              className="flex items-center justify-between border border-[#e0e0e0] p-4"
            >
              <div>
                <p className="font-medium text-black">{o.name}</p>
                <p className="text-sm text-[#666666]">{o.costText || `${o.points} points`}</p>
              </div>
              <button
                onClick={() => handleRedeem(o.id)}
                disabled={!affordable || redeeming || busyId === o.id}
                className="px-4 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-[#333333] disabled:bg-[#e0e0e0] disabled:text-[#999999] disabled:cursor-not-allowed"
              >
                {busyId === o.id ? 'Redeeming...' : affordable ? 'Redeem' : 'Not enough points'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
