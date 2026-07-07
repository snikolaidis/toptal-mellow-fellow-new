import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { getClient, getBrowserClient } from '@/lib/apollo-client';
import { GET_COLLECTION_SLIDER_PRODUCTS } from '@/graphql/queries/collections';
import { Product } from '@/types/woocommerce';
import CollectionGroup, { CollectionGroupItem } from './CollectionGroup';

export interface LandingCollectionGroupItem {
  slug: string;
  name: string;
  titleOverride?: string | null;
  thumbnailUrl?: string | null;
  url?: string | null;
}

interface LandingCollectionGroupProps {
  heading?: string;
  showThumbnail?: boolean;
  showProductsSlider?: boolean;
  productCount?: number | null;
  items: LandingCollectionGroupItem[];
}

/**
 * Fetches products for whichever collection tab is active, one at a time,
 * via the same client-side query CollectionSlider.tsx uses. The number of
 * tabs is admin-configured per landing page (an ACF repeater), so it can't be
 * known when the template's own server-side query is built — see
 * template-landing-page.tsx.
 */
export default function LandingCollectionGroup({
  heading,
  showThumbnail = false,
  showProductsSlider = false,
  productCount,
  items,
}: LandingCollectionGroupProps) {
  const [activeHandle, setActiveHandle] = useState(items[0]?.slug);
  const count = Math.max(1, Math.floor(productCount || 8));

  const client = typeof window !== 'undefined' ? getBrowserClient() : getClient();
  const { data, loading } = useQuery(GET_COLLECTION_SLIDER_PRODUCTS, {
    client,
    variables: { collectionSlug: activeHandle, first: count },
    skip: !activeHandle,
  });

  if (items.length === 0) {
    return null;
  }

  const activeProducts = (data?.products?.nodes as Product[] | undefined) ?? [];

  const collections: CollectionGroupItem[] = items.map((item) => ({
    handle: item.slug,
    title: item.name,
    customTitle: item.titleOverride ?? undefined,
    url: item.url ?? undefined,
    thumbnailUrl: item.thumbnailUrl ?? undefined,
    products: item.slug === activeHandle ? activeProducts : [],
  }));

  return (
    <CollectionGroup
      heading={heading}
      showThumbnail={showThumbnail}
      showProductsSlider={showProductsSlider}
      collections={collections}
      activeHandle={activeHandle}
      onActiveChange={setActiveHandle}
      loading={loading}
    />
  );
}

LandingCollectionGroup.displayName = 'LandingCollectionGroup';
