import { GetStaticProps } from 'next';
import Link from 'next/link';
import { getClient } from '@/lib/apollo-client';
import { GET_COLLECTIONS } from '@/graphql/queries/collections';
import Layout from '@/components/Layout';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import { Collection } from '@/types/woocommerce';
import styles from '@/styles/pages/collections.module.css';

interface CollectionsPageProps {
  collections: Collection[];
}

export default function CollectionsPage({ collections }: CollectionsPageProps) {
  return (
    <Layout title="Collections">
      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          <h1 className={styles.title}>collections</h1>
          <p className={styles.subtitle}>
            Curated selections of our finest products
          </p>
        </header>

        {/* Collections Grid */}
        <div className={styles.grid}>
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collection/${collection.slug}`}
              className={styles.card}
            >
              <div className={styles.cardContent}>
                <h2 className={styles.cardTitle}>{collection.name}</h2>
                {collection.description && (
                  <p
                    className={styles.cardDescription}
                    dangerouslySetInnerHTML={{ __html: collection.description }}
                  />
                )}
                <span className={styles.cardCount}>
                  {collection.count} {collection.count === 1 ? 'product' : 'products'}
                </span>
              </div>
              <div className={styles.cardArrow}>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {collections.length === 0 && (
          <div className={styles.empty}>
            <p>No collections available yet.</p>
          </div>
        )}
      </div>

      <ReviewsCarousel />
    </Layout>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_COLLECTIONS,
    });

    const collections = data?.collections?.nodes || [];

    return {
      props: {
        collections,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching collections:', error);
    return {
      props: {
        collections: [],
      },
      revalidate: 60,
    };
  }
};
