import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getClient } from '@/lib/apollo-client';
import {
  GET_COLLECTION_BY_SLUG,
  GET_ALL_COLLECTION_SLUGS,
} from '@/graphql/queries/collections';
import Layout from '@/components/Layout';
import ProductCard from '@/components/ProductCard';
import Select from '@/components/ui/Select';
import { Collection, Product } from '@/types/woocommerce';
import styles from '@/styles/pages/collection.module.css';

interface CollectionPageProps {
  collection: Collection;
}

const sortOptions = [
  { value: 'default', label: 'Default' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

export default function CollectionPage({ collection }: CollectionPageProps) {
  const [sortBy, setSortBy] = useState('default');

  const products = collection?.products?.nodes || [];

  const sortedProducts = useMemo(() => {
    const sorted = [...products];

    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        sorted.sort((a, b) => {
          const priceA = parseFloat(a.price?.replace(/[^0-9.]/g, '') || '0');
          const priceB = parseFloat(b.price?.replace(/[^0-9.]/g, '') || '0');
          return priceA - priceB;
        });
        break;
      case 'price-desc':
        sorted.sort((a, b) => {
          const priceA = parseFloat(a.price?.replace(/[^0-9.]/g, '') || '0');
          const priceB = parseFloat(b.price?.replace(/[^0-9.]/g, '') || '0');
          return priceB - priceA;
        });
        break;
      default:
        break;
    }

    return sorted;
  }, [products, sortBy]);

  if (!collection) {
    return (
      <Layout title="Collection Not Found">
        <div className={styles.notFound}>
          <h1>Collection Not Found</h1>
          <p>The collection you are looking for does not exist.</p>
          <Link href="/collections" className="btn-primary">
            View All Collections
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={collection.name}>
      <div className={styles.page}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb}>
          <Link href="/">Home</Link>
          <span className={styles.separator}>/</span>
          <Link href="/collections">Collections</Link>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>{collection.name}</span>
        </nav>

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>{collection.name}</h1>
            {collection.description && (
              <div
                className={styles.description}
                dangerouslySetInnerHTML={{ __html: collection.description }}
              />
            )}
          </div>
        </header>

        {/* Controls */}
        <div className={styles.controls}>
          <span className={styles.productCount}>
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
          <div className={styles.sortWrapper}>
            <span className={styles.sortLabel}>Sort by</span>
            <Select
              options={sortOptions}
              value={sortOptions.find((opt) => opt.value === sortBy)}
              onChange={(option) => setSortBy(option?.value || 'default')}
              className={styles.sortSelect}
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className={styles.productsGrid}>
          {sortedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {products.length === 0 && (
          <div className={styles.empty}>
            <p>No products in this collection yet.</p>
            <Link href="/shop" className="btn-secondary">
              Browse All Products
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_ALL_COLLECTION_SLUGS,
    });

    const paths =
      data?.collections?.nodes?.map((collection: { slug: string }) => ({
        params: { slug: collection.slug },
      })) || [];

    return {
      paths,
      fallback: 'blocking',
    };
  } catch (error) {
    console.error('Error fetching collection slugs:', error);
    return {
      paths: [],
      fallback: 'blocking',
    };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const client = getClient();
    const { data } = await client.query({
      query: GET_COLLECTION_BY_SLUG,
      variables: { slug: params?.slug },
    });

    if (!data?.collection) {
      return { notFound: true };
    }

    return {
      props: {
        collection: data.collection,
      },
      revalidate: 60,
    };
  } catch (error) {
    console.error('Error fetching collection:', error);
    return { notFound: true };
  }
};
