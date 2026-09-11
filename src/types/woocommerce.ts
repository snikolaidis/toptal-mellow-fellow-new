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

/**
 * ACF image fields come through WPGraphQL as a media-item connection edge
 * (`AcfMediaItemConnectionEdge`), not a flat object.
 */
export interface AcfImageField {
  node?: {
    sourceUrl?: string | null;
    altText?: string | null;
    mediaDetails?: { width?: number | null; height?: number | null } | null;
  } | null;
}

export interface ProductTaxonomyTerm {
  id: string;
  name: string;
  slug?: string;
  extraTaxonomyFields?: { propIcon?: AcfImageField | null } | null;
}

// Not on `Product` — fetched by the PDP alone.
export interface ProductTaxonomies {
  flavors?: { nodes: ProductTaxonomyTerm[] } | null;
  vibes?: { nodes: ProductTaxonomyTerm[] } | null;
  effects?: { nodes: ProductTaxonomyTerm[] } | null;
  settings?: { nodes: ProductTaxonomyTerm[] } | null;
}

// `Nutrition` ACF group (not nested under productDetails). Fields are ACF
// "text", so GraphQL returns strings, not floats.
export interface ProductNutrition {
  calories?: string | null;
  sugar?: string | null;
}

export interface CannabinoidServing {
  cannabinoid?: string | null;
  mg?: number | null;
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
  // Image fields
  timelineImage?: AcfImageField | null;
  // Post-object references (single)
  deviceFaqsReference?: { nodes?: Array<{ id?: string; title?: string; content?: string }> } | null;
  deviceFaqTest?: { node?: { id?: string; title?: string } | null } | null;
  blendNoidFaqsReference?: { node?: { id?: string; title?: string } | null } | null;
  newNoidBlendDescriptionsReference?: { node?: { id?: string; title?: string } | null } | null;
  // Relationship (multi-select posts)
  badges?: { nodes?: Array<{ id?: string; title?: string }> } | null;
  // Mellow Meter fields — meterType returns [String] (ACF checkbox).
  meterType?: string[] | null;
  meterValue?: number | null;
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
  // Bundle Builder plugin fields, config lives on the product itself.
  // "byob": shopper picks from bbBundleProducts (bbMinItems/Max,
  // bbDiscountRules, bbFromPrice). "fixed"/"mystery": admin-picked set
  // (bbFixedItems/Price/QtyMin/Max) — "mystery" hides bbFixedItems from customers.
  bbBundleMode?: 'byob' | 'fixed' | 'mystery' | null;
  bbDescription?: string | null;
  // Admin toggle for whether the "From $X" teaser (bbFromPrice) renders.
  bbShowPrice?: boolean | null;
  bbFromPrice?: number | null;
  bbMinItems?: number | null;
  bbMaxItems?: number | null;
  bbDiscountRules?: Array<{ minQty: number; percent: number }> | null;
  bbBundleProducts?: Product[] | null;
  bbFixedItems?: Array<{ productId: number; quantity: number }> | null;
  bbFixedPrice?: number | null;
  // Undiscounted total for one set — struck through next to bbFixedPrice.
  bbFixedOriginalPrice?: number | null;
  bbFixedQtyMin?: number | null;
  bbFixedQtyMax?: number | null;
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

