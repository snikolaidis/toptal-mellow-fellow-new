import { useEffect } from 'react';
import Layout from '@/components/Layout';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';

export default function BonusPointsProductsPage() {
  const { ready, token } = useYotpoLoyalty();
  const couponsRedemption = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_COUPONS_REDEMPTION_INSTANCE;
  const vipTiers = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_VIP_TIERS_INSTANCE;
  const referralShare = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_REFERRAL_SHARE_INSTANCE;

  useEffect(() => {
    if (ready && (couponsRedemption || vipTiers || referralShare)) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, couponsRedemption, vipTiers, referralShare]);

  return (
    <Layout title="Bonus Points Products">
      {ready && couponsRedemption && (
        <div
          key={`${token ?? 'guest'}-coupons`}
          className="yotpo-widget-instance"
          data-yotpo-instance-id={couponsRedemption}
          suppressHydrationWarning
        />
      )}
      {ready && vipTiers && (
        <div
          key={`${token ?? 'guest'}-vip`}
          className="yotpo-widget-instance"
          data-yotpo-instance-id={vipTiers}
          suppressHydrationWarning
        />
      )}
      {ready && referralShare && (
        <div
          key={`${token ?? 'guest'}-referral`}
          className="yotpo-widget-instance"
          data-yotpo-instance-id={referralShare}
          suppressHydrationWarning
        />
      )}
    </Layout>
  );
}
