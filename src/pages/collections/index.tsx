import { GetStaticProps } from 'next';
import Link from 'next/link';
import { gql } from '@apollo/client';
import { WordPressBlocksViewer } from '@faustwp/blocks';
import blocks from '@/wp-blocks';
import { getClient } from '@/lib/apollo-client';
import { GET_COLLECTIONS } from '@/graphql/queries/collections';
import Layout from '@/components/Layout';
import ReviewsCarousel from '@/wp-blocks/ReviewsCarousel';
import { Collection } from '@/types/woocommerce';
import styles from '@/styles/pages/collections.module.css';

/**
 * /collections — the "Catalog" page (Shopify parity). Content is managed in
 * the WP page with slug `collections`: an ordered set of `acf/collection-links`
 * blocks (grid layout + section heading) rendered via WordPressBlocksViewer,
 * like the front page. Until that page exists (or if the query fails), we fall
 * back to the auto-generated product-category listing so the route never 404s.
 */

interface CatalogPageData {
  title?: string | null;
  editorBlocks?: any[] | null;
  seo?: { title?: string | null; metaDesc?: string | null } | null;
}

interface CollectionsPageProps {
  page: CatalogPageData | null;
  collections: Collection[] | null;
}

// Only the blocks this page supports are spread here (contained blast radius):
// collection-links sections, an optional reviews carousel, and paragraphs for
// intro copy. CoreHeading is deliberately excluded (known textAlign/align
// schema mismatch in the bundled fragment) — the h1 is hardcoded instead.
const GET_COLLECTIONS_CATALOG_PAGE = gql`
  ${blocks.AcfCollectionLinks.fragments.entry}
  ${blocks.AcfReviewsCarousel.fragments.entry}
  ${blocks.CoreParagraph.fragments.entry}
  query CollectionsCatalogPage($uri: ID!) {
    page(id: $uri, idType: URI) {
      title
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blocks.AcfCollectionLinks.fragments.key}
        ...${blocks.AcfReviewsCarousel.fragments.key}
        ...${blocks.CoreParagraph.fragments.key}
      }
      seo {
        title
        metaDesc
      }
    }
  }
`;

export default function CollectionsPage({ page, collections }: CollectionsPageProps) {
  if (page?.editorBlocks?.length) {
    const seo = {
      title: page.seo?.title ?? undefined,
      metaDesc: page.seo?.metaDesc ?? undefined,
    };
    return (
      <Layout title="Collections" seo={seo}>
        <div className={styles.page}>
          <header className={styles.catalogHeader}>
            <h1 className={styles.catalogTitle}>Catalog</h1>
          </header>
        </div>
        <WordPressBlocksViewer blocks={page.editorBlocks} />
      </Layout>
    );
  }

  // Temporary fallback until the WP "Collections" page is created and deployed.
  return (
    <Layout title="Collections">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>collections</h1>
          <p className={styles.subtitle}>
            Curated selections of our finest products
          </p>
        </header>

        <div className={styles.grid}>
          {(collections ?? []).map((collection) => (
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

        {(collections ?? []).length === 0 && (
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
  const client = getClient();

  try {
    const { data } = await client.query({
      query: GET_COLLECTIONS_CATALOG_PAGE,
      variables: { uri: '/collections' },
    });

    if (data?.page?.editorBlocks?.length) {
      return {
        props: {
          page: data.page,
          collections: null,
        },
        revalidate: 60,
      };
    }
  } catch (error) {
    console.error('Error fetching collections catalog page:', error);
  }

  try {
    const { data } = await client.query({ query: GET_COLLECTIONS });

    return {
      props: {
        page: null,
        collections: data?.productCategories?.nodes || [],
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching collections:', error);
    return {
      props: {
        page: null,
        collections: [],
      },
      revalidate: 60,
    };
  }
};
