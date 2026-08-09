// Import and re-export AddressData from checkout.ts to avoid duplication
import type { AddressData } from './checkout';
export type { AddressData };

export interface ProductImage {
  id: string;
  sourceUrl: string;
  altText: string;
}

export interface ProductCategory {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  count?: number;
}

export interface RelatedCollection {
  id: string;
  name: string;
  slug: string;
  collectionFields?: { thumbnailImage?: { node?: { sourceUrl: string; altText?: string } } };
}

export interface CollectionFields {
  collectionImage?: { node?: { sourceUrl: string; altText?: string } };
  collectionHeroDesktop?: { node?: { sourceUrl: string; altText?: string } };
  collectionHeroMobile?: { node?: { sourceUrl: string; altText?: string } };
  thumbnailImage?: { node?: { sourceUrl: string; altText?: string } };
  warningMessage?: string | null;
  faqSectionTitle?: string | null;
  faqs?: { nodes: Array<{ id: string; title: string; content: string }> };
  relatedCollectionTitle?: string | null;
  relatedCollections?: { nodes: RelatedCollection[] };
}

export interface Collection {
  id: string;
  databaseId: number;
  name: string;
  slug: string;
  description?: string;
  count?: number;
  products?: {
    nodes: Product[];
  };
  collectionFields?: CollectionFields;
  seo?: {
    title?: string;
    metaDesc?: string;
    schema?: { raw?: string };
    opengraphTitle?: string;
    opengraphDescription?: string;
    opengraphImage?: { sourceUrl?: string };
  };
}

export interface ProductVariation {
  id: string;
  databaseId: number;
  name: string;
  price: string;
  regularPrice: string;
  salePrice?: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ON_BACKORDER';
  attributes?: {
    nodes: Array<{
      name: string;
      value: string;
    }>;
  };
}

export interface ProductACF {
  // Text / textarea / wysiwyg
  coaLink?: string | null;
  deviceSpecifications?: string | null;
  directionsForUse?: string | null;
  disclaimers?: string | null;
  ingredientsV2?: string | null;
  servingSize?: string | null;
  whatIsNoid?: string | null;
  // Link field (url + title + target)
  userManual?: { url?: string | null; title?: string | null; target?: string | null } | null;
  // Image field
  blendsHighlights?: { sourceUrl?: string | null; altText?: string | null } | null;
  // Image field exposed as a media-item edge by ACF's GraphQL integration
  timelineImage?: {
    node?: {
      sourceUrl?: string | null;
      altText?: string | null;
      mediaDetails?: { width?: number | null; height?: number | null } | null;
    } | null;
  } | null;
  // Post-object references (single)
  deviceFaqsReference?: { nodes?: Array<{ id?: string; title?: string; content?: string }> } | null;
  deviceFaqTest?: { node?: { id?: string; title?: string } | null } | null;
  blendNoidFaqsReference?: { node?: { id?: string; title?: string } | null } | null;
  newNoidBlendDescriptionsReference?: { node?: { id?: string; title?: string } | null } | null;
  // Relationship (multi-select posts)
  badges?: { nodes?: Array<{ id?: string; title?: string }> } | null;
}

export interface Product {
  __typename?: 'SimpleProduct' | 'VariableProduct' | 'ExternalProduct' | 'GroupProduct';
  id: string;
  databaseId: number;
  shopifyId?: string | null;
  name: string;
  slug: string;
  type?: 'SIMPLE' | 'VARIABLE' | 'GROUPED' | 'EXTERNAL';
  date?: string | null;
  description?: string;
  shortDescription?: string;
  sku?: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  // Bundle Builder plugin fields — set only on products that are actually a
  // "build your own bundle" entry point. bbLinkedBundleId points at the
  // BundleBuilder post (fetch via bundleBuilder(id, idType: DATABASE_ID));
  // bbFromPrice is the bundle's starting-from price since a bundle has no
  // single fixed price.
  bbLinkedBundleId?: number | null;
  bbFromPrice?: number | null;
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'ON_BACKORDER';
  stockQuantity?: number;
  externalUrl?: string;
  buttonText?: string;
  image?: ProductImage;
  galleryImages?: {
    nodes: ProductImage[];
  };
  productCategories?: {
    nodes: ProductCategory[];
  };
  collections?: {
    nodes: Collection[];
  };
  variations?: {
    nodes: ProductVariation[];
  };
  productDetails?: ProductACF;
  // Product attribute taxonomies (migrated from Shopify), surfaced on cards.
  strainTypes?: { nodes: Array<{ name: string }> };
  strainNames?: { nodes: Array<{ name: string }> };
  blendTypes?: { nodes: Array<{ name: string }> };
  productLines?: { nodes: Array<{ name: string }> };
  size?: { nodes: Array<{ name: string }> };
  mfproductTypes?: { nodes: Array<{ name: string }> };
  mG?: { nodes: Array<{ name: string; slug: string }> };
  pieces?: { nodes: Array<{ name: string; slug: string }> };
  uniqueSellingProps?: {
    nodes: Array<{
      id: string;
      name: string;
      uniqueSellingFields?: {
        propIcon?: { node?: { sourceUrl: string; altText?: string } };
      };
    }>;
  };
  seo?: {
    title?: string;
    metaDesc?: string;
    schema?: { raw?: string };
    opengraphTitle?: string;
    opengraphDescription?: string;
    opengraphImage?: { sourceUrl?: string };
  };
}

export interface CartItem {
  key: string;
  quantity: number;
  total: string;
  product: {
    node: {
      id: string;
      databaseId: number;
      name: string;
      slug: string;
      price: string;
      image?: ProductImage;
    };
  };
  variation?: {
    node: {
      id: string;
      databaseId: number;
      name: string;
      price: string;
    };
  };
}

export interface Cart {
  contents: {
    nodes: CartItem[];
  };
  subtotal: string;
  total: string;
  discountTotal: string;
  shippingTotal: string;
  isEmpty: boolean;
  totalItemsCount: number;
}

export interface Order {
  id: string;
  databaseId: number;
  orderNumber: string;
  status: string;
  date: string;
  total: string;
  subtotal: string;
  shippingTotal: string;
  discountTotal: string;
  billing: AddressData;
  shipping: AddressData;
  lineItems: {
    nodes: Array<{
      quantity: number;
      total: string;
      product: {
        node: {
          name: string;
          image?: ProductImage;
        };
      };
    }>;
  };
}

