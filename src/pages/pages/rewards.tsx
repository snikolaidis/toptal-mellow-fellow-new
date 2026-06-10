import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

export default function RewardsPage() {
  const [mounted, setMounted] = useState(false);
  const instance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_PAGE_INSTANCE;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && instance) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [mounted, instance]);

  return (
    <Layout title="Rewards">
      {mounted && instance && (
        <div
          className="yotpo-widget-instance"
          data-yotpo-instance-id={instance}
          suppressHydrationWarning
        />
      )}
    </Layout>
  );
}
