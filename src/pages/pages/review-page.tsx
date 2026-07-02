import { GetStaticProps } from 'next';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import FeaturedCollection from '@/components/FeaturedCollection';
import { getClient } from '@/lib/apollo-client';
import { GET_CONTENT_PAGE_BY_SLUG } from '@/graphql/queries/pages';
import { GET_COLLECTION_SLIDER_PRODUCTS } from '@/graphql/queries/collections';
import type { ContentPageData } from '@/types/mellow-fellow';
import type { Product } from '@/types/woocommerce';
import styles from '@/styles/pages/review-page.module.css';

const WP_MEDIA_BASE = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');

const POPULAR_CATEGORIES = [
  {
    label: 'Disposable Vapes',
    href: '/collections/disposable-vapes',
    image: `${WP_MEDIA_BASE}/wp-content/uploads/2026/07/Asset_1_54f0d485-f584-4c24-b7ac-79bece6c9efd-506257.webp`,
  },
  {
    label: 'Vape Cartridges',
    href: '/collections/vape-cartridges',
    image: `${WP_MEDIA_BASE}/wp-content/uploads/2026/07/Asset_8_8305b22b-4280-4f5e-8b63-daaf61bd2d2e-938618.webp`,
  },
  {
    label: 'Edibles',
    href: '/collections/edibles',
    image: `${WP_MEDIA_BASE}/wp-content/uploads/2026/07/Asset_7_ed34c148-b9b6-47fa-978f-b65e12db436b-283619.webp`,
  },
  {
    label: 'Bundles',
    href: '/collections/bundles',
    image: `${WP_MEDIA_BASE}/wp-content/uploads/2026/07/MF_Bundles2-514310.webp`,
  },
];

interface ReviewPageProps {
  page: ContentPageData | null;
  products: Product[];
}

export default function ReviewPage({ page, products }: ReviewPageProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Layout title={page?.title ?? 'Reviews'} seo={page?.seo}>
      <div className={styles.intro}>
        <h1 className={styles.introHeading}>Mellow Fam Reviews</h1>
      </div>
      {mounted && (
        <div className={styles.reviewsWrap}>
          <div id="klaviyo-featured-reviews-carousel" />
        </div>
      )}
      {mounted && (
        <div className={styles.reviewsWrap}>
          <div id="klaviyo-reviews-all" data-id="all" />
        </div>
      )}

      {products.length > 0 && (
        <div className={styles.famFavorites}>
          <FeaturedCollection products={products} title="Fam Favorites" />
          <div className={styles.shopAllCta}>
            <a className={styles.button} href="/collections/best-sellers">
              View all
            </a>
          </div>
        </div>
      )}

      <section className={styles.popularCategories}>
        <h2 className={styles.popularHeading}>Popular categories</h2>
        <div className={styles.categoryTiles}>
          {POPULAR_CATEGORIES.map((cat) => (
            <a key={cat.href} href={cat.href} className={styles.categoryTile}>
              <img className={styles.categoryTileImage} src={cat.image} alt="" />
              <span className={styles.categoryTileLabel}>{cat.label}</span>
            </a>
          ))}
        </div>
      </section>
    </Layout>
  );
}

export const getStaticProps: GetStaticProps<ReviewPageProps> = async () => {
  const client = getClient();

  let page: ContentPageData | null = null;
  try {
    const { data } = await client.query({
      query: GET_CONTENT_PAGE_BY_SLUG,
      variables: { slug: '/review-page' },
    });
    page = data?.page ?? null;
  } catch (error) {
    console.error('Error fetching review-page page:', error);
  }

  let products: Product[] = [];
  try {
    const { data } = await client.query({
      query: GET_COLLECTION_SLIDER_PRODUCTS,
      variables: {
        collectionSlug: 'best-sellers',
        first: 10,
        orderby: [{ field: 'TOTAL_SALES', order: 'DESC' }],
      },
    });
    products = data?.products?.nodes ?? [];
  } catch (error) {
    console.error('Error fetching Fam Favorites (best-sellers) products:', error);
  }

  return { props: { page, products }, revalidate: 60 };
};
