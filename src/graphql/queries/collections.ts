import { gql } from '@apollo/client';
import {
  SIMPLE_PRODUCT_FIELDS,
  VARIABLE_PRODUCT_FIELDS,
  EXTERNAL_PRODUCT_FIELDS,
  GROUP_PRODUCT_FIELDS,
} from './products';

// Get all collections (mapped to WooCommerce product categories)
export const GET_COLLECTIONS = gql`
  query GetCollections {
    productCategories(first: 100) {
      nodes {
        id
        databaseId
        name
        slug
        description
        count
      }
    }
  }
`;

// Get a single collection by slug with its products
export const GET_COLLECTION_BY_SLUG = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetCollectionBySlug($slug: ID!, $collectionSlug: String!) {
    collection(id: $slug, idType: SLUG) {
      id
      databaseId
      name
      slug
      description
      count
      seo {
        title
        metaDesc
        schema {
          raw
        }
        opengraphTitle
        opengraphDescription
        opengraphImage {
          sourceUrl
        }
      }
    }
    products(first: 100, where: {
      taxonomyFilter: {
        filters: [{
          taxonomy: COLLECTION,
          terms: [$collectionSlug],
          operator: IN
        }]
      }
    }) {
      nodes {
        __typename
        ... on SimpleProduct {
          ...SimpleProductFields
        }
        ... on VariableProduct {
          ...VariableProductFields
        }
        ... on ExternalProduct {
          ...ExternalProductFields
        }
        ... on GroupProduct {
          ...GroupProductFields
        }
      }
    }
  }
`;

// Get a collection's products by slug for the CollectionSlider block
export const GET_COLLECTION_SLIDER_PRODUCTS = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetCollectionSliderProducts($collectionSlug: String!, $first: Int = 24) {
    products(first: $first, where: {
      status: "publish",
      taxonomyFilter: {
        filters: [{
          taxonomy: COLLECTION,
          terms: [$collectionSlug],
          operator: IN
        }]
      }
    }) {
      nodes {
        __typename
        ... on SimpleProduct {
          ...SimpleProductFields
        }
        ... on VariableProduct {
          ...VariableProductFields
        }
        ... on ExternalProduct {
          ...ExternalProductFields
        }
        ... on GroupProduct {
          ...GroupProductFields
        }
      }
    }
  }
`;

// Get a single collection's meta (no products). Used by the SSR collection
// page, which fetches products separately via GET_PRODUCTS (collectionFilterIn).
export const GET_COLLECTION_META = gql`
  query GetCollectionMeta($slug: ID!) {
    collection(id: $slug, idType: SLUG) {
      id
      databaseId
      name
      slug
      description
      count
      seo {
        title
        metaDesc
        schema {
          raw
        }
        opengraphTitle
        opengraphDescription
        opengraphImage {
          sourceUrl
        }
      }
    }
  }
`;

// Lean query over a collection's products selecting only the facet taxonomy
// connections (name + slug), used to derive collection-scoped filter terms.
export const GET_COLLECTION_FACET_TERMS = gql`
  query GetCollectionFacetTerms($terms: [String]) {
    products(first: 300, where: { collectionFilterIn: $terms }) {
      nodes {
        __typename
        ... on SimpleProduct { ...FacetTermFields }
        ... on VariableProduct { ...FacetTermFields }
        ... on ExternalProduct { ...FacetTermFields }
        ... on GroupProduct { ...FacetTermFields }
      }
    }
  }

  fragment FacetTermFields on Product {
    id
    databaseId
    mfproductTypes { nodes { name slug } }
    size { nodes { name slug } }
    strainTypes { nodes { name slug } }
    blendTypes { nodes { name slug } }
    cannabinoids { nodes { name slug } }
    singleCannabinoid { nodes { name slug } }
    mG { nodes { name slug } }
    pieces { nodes { name slug } }
  }
`;

// Get all collection slugs for static paths
export const GET_ALL_COLLECTION_SLUGS = gql`
  query GetAllCollectionSlugs {
    productCategories(first: 100) {
      nodes {
        slug
      }
    }
  }
`;

// Get products that share a category with a given product (for "More from Collection")
export const GET_COLLECTION_PRODUCTS_BY_PRODUCT_SLUG = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetCollectionProductsByProductSlug($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      productCategories {
        nodes {
          id
          name
          slug
          products(first: 12, where: { status: "publish" }) {
            nodes {
              __typename
              ... on SimpleProduct {
                ...SimpleProductFields
              }
              ... on VariableProduct {
                ...VariableProductFields
              }
              ... on ExternalProduct {
                ...ExternalProductFields
              }
              ... on GroupProduct {
                ...GroupProductFields
              }
            }
          }
        }
      }
    }
  }
`;
