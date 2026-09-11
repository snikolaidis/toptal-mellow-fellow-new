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

// Deliberately not on `Product`: these four are fetched by the PDP alone, so
// keeping them off the shared type makes a stale reader a compile error.
export interface ProductTaxonomies {
  flavors?: { nodes: ProductTaxonomyTerm[] } | null;
  vibes?: { nodes: ProductTaxonomyTerm[] } | null;
  effects?: { nodes: ProductTaxonomyTerm[] } | null;
  settings?: { nodes: ProductTaxonomyTerm[] } | null;
}

// The `Nutrition` ACF group, attached directly to products (not nested under
// productDetails). Fields are ACF "text" (not "number"), so GraphQL returns
// them as strings, not floats. `carbs` also exists on the group but is
// unused so far.
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
  // Mellow Meter fields — meterType is an ACF checkbox field (GraphQL
  // returns [String]), meterValue is a plain number field.
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
  // Bundle Builder plugin fields — the whole config lives directly on the
  // product. bbBundleMode distinguishes the two flows:
  // "byob" — shopper picks their own items from bbBundleProducts, within
  //   bbMinItems/bbMaxItems, priced by tiered bbDiscountRules. bbFromPrice is
  //   the cheapest-possible total, for a "From $X" teaser.
  // "fixed" — admin-picked exact items/quantities, nothing for the shopper
  //   to select. bbFixedItems is that picked set, bbFixedPrice is the flat
  //   total, bbFixedQtyMin/Max bound how many sets can be added.
  // The plugin dropped the bundleBuilder root query when it added these, so
  // a bundle's own slug now comes from mf/v1/product rather than GraphQL.
  bbBundleMode?: 'byob' | 'fixed' | null;
  bbDescription?: string | null;
  // Whether the "From $X" teaser (bbFromPrice) should render on the card/PDP
  // for a byob bundle — an admin-facing toggle.
  bbShowPrice?: boolean | null;
  bbFromPrice?: number | null;
  bbMinItems?: number | null;
  bbMaxItems?: number | null;
  bbDiscountRules?: Array<{ minQty: number; percent: number }> | null;
  bbBundleProducts?: Product[] | null;
  bbFixedItems?: Array<{ productId: number; quantity: number }> | null;
  bbFixedPrice?: number | null;
  // Undiscounted total for one set (sum of each item's regular price × qty)
  // — shown struck through next to bbFixedPrice when it's a real discount.
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
  flavors?: { nodes: ProductTaxonomyTerm[] };
  vibes?: { nodes: ProductTaxonomyTerm[] };
  feelings?: { nodes: ProductTaxonomyTerm[] };
  settings?: { nodes: ProductTaxonomyTerm[] };
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

