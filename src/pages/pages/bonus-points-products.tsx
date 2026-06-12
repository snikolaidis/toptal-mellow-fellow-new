import { useEffect, useState } from 'react';
import { GetStaticProps } from 'next';
import Layout from '@/components/Layout';
import FeaturedCollection from '@/components/FeaturedCollection';
import { getClient } from '@/lib/apollo-client';
import { GET_COLLECTION_BY_SLUG } from '@/graphql/queries/collections';
import { Product } from '@/types/woocommerce';

const BONUS_POINTS_COLLECTION_SLUG = 'bonus-points-products-collection';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';
import styles from '@/styles/pages/bonus-points-products.module.css';

interface BonusPointsProductsPageProps {
  products: Product[];
}

export default function BonusPointsProductsPage({ products }: BonusPointsProductsPageProps) {
  const { ready, token } = useYotpoLoyalty();
  const [bannerError, setBannerError] = useState(false);
  const [learnImageError, setLearnImageError] = useState(false);
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
      <section className={styles.banner}>
        {!bannerError && (
          <picture>
            <source media="(max-width: 749px)" srcSet="/BPP_Landing_Page_copy_mobile.webp" />
            <img
              className={styles.bannerImage}
              src="/BPP_Landing_Page_copy.webp"
              alt="Bonus Points Products"
              onError={() => setBannerError(true)}
            />
          </picture>
        )}
        <h1 className={bannerError ? styles.bannerHeading : styles.srOnly}>Bonus Points Products</h1>
      </section>

      <FeaturedCollection products={products} title="Shop All Products" />

      <div className={styles.shopAllCta}>
        <a className={styles.button} href="/shop">
          Shop All Products
        </a>
      </div>

      <section className={styles.learnMore}>
        {!learnImageError && (
          <div className={styles.learnImage}>
            <img
              src="/MF_Web_2025_More_Questions.png"
              alt="Looking to Learn More"
              onError={() => setLearnImageError(true)}
            />
          </div>
        )}
        <div className={styles.learnContent}>
          <h2 className={styles.learnHeading}>Looking to Learn More?</h2>
          <p>
            We offer a wide range of product types in a large variation of cannabinoids.{' '}
            <a href="/shop">See all products here.</a>
          </p>
          <p>
            Looking to learn more about cannabinoids and our blends? We encourage active education
            about cannabis. <a href="/pages/learn-about-cannabinoids-1">Learn About Cannabinoids</a>
          </p>
          <p>Get 15% off your first purchase when you join the Mellow Fam!</p>
        </div>
      </section>

      <section className={styles.loyalty}>
        <h2 className={styles.loyaltyHeading}>My Loyalty Program</h2>
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
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_COLLECTION_BY_SLUG,
      variables: {
        slug: BONUS_POINTS_COLLECTION_SLUG,
        collectionSlug: BONUS_POINTS_COLLECTION_SLUG,
      },
    });
    const products: Product[] = data?.products?.nodes || [];
    return {
      props: { products },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching bonus points products:', error);
    return {
      props: { products: [] },
      revalidate: 60,
    };
  }
};
