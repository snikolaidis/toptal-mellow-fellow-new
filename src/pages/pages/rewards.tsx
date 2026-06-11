import { useEffect } from 'react';
import Layout from '@/components/Layout';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';

export default function RewardsPage() {
  const { ready, token } = useYotpoLoyalty();
  const instance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_PAGE_INSTANCE;

  useEffect(() => {
    if (ready && instance) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, instance]);

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
    </Layout>
  );
}
