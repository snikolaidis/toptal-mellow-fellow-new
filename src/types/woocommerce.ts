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

export interface CollectionFields {
  collectionImage?: string;
  collectionHeroDesktop?: string;
  collectionHeroMobile?: string;
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
  lineCollection?: string;
  experienceType?: string;
  strainName?: string;
  strainType?: string;
}

export interface Product {
  __typename?: 'SimpleProduct' | 'VariableProduct' | 'ExternalProduct' | 'GroupProduct';
  id: string;
  databaseId: number;
  shopifyId?: string | null;
  name: string;
  slug: string;
  type?: 'SIMPLE' | 'VARIABLE' | 'GROUPED' | 'EXTERNAL';
  description?: string;
  shortDescription?: string;
  sku?: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
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

