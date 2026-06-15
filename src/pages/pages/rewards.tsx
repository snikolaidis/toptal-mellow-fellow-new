import { useEffect } from 'react';
import Layout from '@/components/Layout';
import LoyaltyRedeem from '@/components/LoyaltyRedeem';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { positionLoyaltyRedeem } from '@/lib/loyaltyPageLayout';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';

const REDEEM_SLOT_ID = 'mf-loyalty-redeem-slot';

export default function RewardsPage() {
  const { ready, token } = useYotpoLoyalty();
  const instance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_PAGE_INSTANCE;

  useEffect(() => {
    if (ready && instance) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, instance]);

  useEffect(() => {
    return positionLoyaltyRedeem({ slotId: REDEEM_SLOT_ID });
  }, []);

  return (
    <Layout title="Rewards">
      {ready && instance && (
        <div
          key={token ?? 'guest'}
          className="yotpo-widget-instance"
          data-yotpo-instance-id={instance}
          suppressHydrationWarning
        />
      )}

      <div id={REDEEM_SLOT_ID}>
        <LoyaltyRedeem />
      </div>
    </Layout>
  );
}
