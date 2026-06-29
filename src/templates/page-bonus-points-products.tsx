import { useEffect, useState } from 'react';
import { FaustTemplate } from '@faustwp/core';
import Layout from '@/components/Layout';
import FeaturedCollection from '@/components/FeaturedCollection';
import LoyaltyRedeem from '@/components/LoyaltyRedeem';
import YotpoWidget from '@/components/YotpoWidget';
import KlaviyoForm from '@/components/KlaviyoForm';
import { GET_COLLECTION_BY_SLUG } from '@/graphql/queries/collections';
import { Product } from '@/types/woocommerce';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';
import styles from '@/styles/pages/bonus-points-products.module.css';

const BONUS_POINTS_COLLECTION_SLUG = 'bonus-points-products-collection';
const WP_MEDIA_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
const BANNER_DESKTOP = `${WP_MEDIA_BASE}/wp-content/uploads/2026/06/BPP_Landing_Page_copy-scaled.webp`;
const BANNER_MOBILE = `${WP_MEDIA_BASE}/wp-content/uploads/2026/06/BPP_Landing_Page_copy_mobile.webp`;

interface BonusPointsData {
  products?: { nodes: Product[] };
}

const BonusPointsProductsPage: FaustTemplate<BonusPointsData> = (props) => {
  const products = props.data?.products?.nodes ?? [];
  const { ready, token } = useYotpoLoyalty();
  const [bannerError, setBannerError] = useState(false);
  const vipTiers = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_VIP_TIERS_INSTANCE;
  const referralShare = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_REFERRAL_SHARE_INSTANCE;

  useEffect(() => {
    if (ready && (vipTiers || referralShare)) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, vipTiers, referralShare]);

  return (
    <Layout title="Bonus Points Products">
      <section className={styles.banner}>
        {!bannerError && (
          <picture>
            <source media="(max-width: 749px)" srcSet={BANNER_MOBILE} />
            <img
              className={styles.bannerImage}
              src={BANNER_DESKTOP}
              alt="Bonus Points Products"
              onError={() => setBannerError(true)}
            />
          </picture>
        )}
        <h1 className={bannerError ? styles.bannerHeading : styles.srOnly}>Bonus Points Products</h1>
      </section>

      <FeaturedCollection products={products} title="Shop All Products" />

      <div className={styles.shopAllCta}>
        <a className={styles.button} href={`/collections/${BONUS_POINTS_COLLECTION_SLUG}`}>
          View all
        </a>
      </div>

      <section className={styles.promo}>
        <h2 className={styles.promoHeading}>Mellow Fam Club Bonus Points Promotional Details:</h2>
        <ul className={styles.promoList}>
          <li>
            <strong>Product Eligibility:</strong> All identified products with badges are eligible
            for this promotion.
          </li>
          <li>
            <strong>How to Redeem:</strong> Add any Bonus Point Product to your order and 100 points
            will be automatically added, once for each product, to your account.
          </li>
          <li>
            <strong>Promotion Combinations:</strong> Enjoy this bonus alongside our regular loyalty
            redemptions for an even bigger reward.
          </li>
          <li>
            <strong>Promotion Period:</strong> This promotion is available while supplies last and
            may be discontinued at our discretion.
          </li>
        </ul>
      </section>

      <section className={styles.signup}>
        <KlaviyoForm formId="YzKBys" />
      </section>

      <section className={styles.loyalty}>
        <h2 className={styles.loyaltyHeading}>My Loyalty Program</h2>
        <LoyaltyRedeem />
        {vipTiers && <YotpoWidget instanceId={vipTiers} />}
        {referralShare && <YotpoWidget instanceId={referralShare} />}
      </section>
    </Layout>
  );
};

BonusPointsProductsPage.query = GET_COLLECTION_BY_SLUG;
BonusPointsProductsPage.variables = () => ({
  slug: BONUS_POINTS_COLLECTION_SLUG,
  collectionSlug: BONUS_POINTS_COLLECTION_SLUG,
});

export default BonusPointsProductsPage;
