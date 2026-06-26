import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Layout from '@/components/Layout';
import LoyaltyRedeem from '@/components/LoyaltyRedeem';
import YotpoWidget from '@/components/YotpoWidget';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { positionLoyaltyRedeem } from '@/lib/loyaltyPageLayout';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';

export default function RewardsPage() {
  const { ready, token } = useYotpoLoyalty();
  const instance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_PAGE_INSTANCE;
  const [redeemTarget, setRedeemTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (ready && instance) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, instance]);

  useEffect(() => {
    return positionLoyaltyRedeem({ onTarget: setRedeemTarget });
  }, []);

  return (
    <Layout title="Rewards">
      {instance && <YotpoWidget instanceId={instance} />}

      {redeemTarget
        ? createPortal(<LoyaltyRedeem variant="discounts" />, redeemTarget)
        : <LoyaltyRedeem variant="discounts" />}
    </Layout>
  );
}
