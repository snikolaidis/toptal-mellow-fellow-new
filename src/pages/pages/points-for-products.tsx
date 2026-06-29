import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@faustwp/core';
import Layout from '@/components/Layout';
import LoyaltyGreeting from '@/components/LoyaltyGreeting';
import YotpoWidget from '@/components/YotpoWidget';
import FreeProductRedemption from '@/components/FreeProductRedemption';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';

export default function PointsForProductsPage() {
  const { isAuthenticated, isReady } = useAuth();
  const { ready, token } = useYotpoLoyalty();
  const instance = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_PRODUCTS_INSTANCE;

  useEffect(() => {
    if (ready && instance) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, instance]);

  return (
    <Layout title="Points for Products">
      <LoyaltyGreeting />

      {isReady && !isAuthenticated ? (
        <div className="loyalty-redeem">
          <h2 className="loyalty-redeem__heading">Points for Products</h2>
          <p className="loyalty-redeem__description">
            Sign in to redeem your points for a free product.
          </p>
          <Link
            href="/login?redirect=/pages/points-for-products"
            className="loyalty-redeem__button"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <FreeProductRedemption />
          {instance && <YotpoWidget instanceId={instance} />}
        </>
      )}
    </Layout>
  );
}
