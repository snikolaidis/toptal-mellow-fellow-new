import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

export default function BonusPointsProductsPage() {
  const [mounted, setMounted] = useState(false);
  const couponsRedemption = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_COUPONS_REDEMPTION_INSTANCE;
  const vipTiers = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_VIP_TIERS_INSTANCE;
  const referralShare = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_REFERRAL_SHARE_INSTANCE;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && (couponsRedemption || vipTiers || referralShare)) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [mounted, couponsRedemption, vipTiers, referralShare]);

  return (
    <Layout title="Bonus Points Products">
      {mounted && couponsRedemption && (
        <div
          className="yotpo-widget-instance"
          data-yotpo-instance-id={couponsRedemption}
          suppressHydrationWarning
        />
      )}
      {mounted && vipTiers && (
        <div
          className="yotpo-widget-instance"
          data-yotpo-instance-id={vipTiers}
          suppressHydrationWarning
        />
      )}
      {mounted && referralShare && (
        <div
          className="yotpo-widget-instance"
          data-yotpo-instance-id={referralShare}
          suppressHydrationWarning
        />
      )}
    </Layout>
  );
}
