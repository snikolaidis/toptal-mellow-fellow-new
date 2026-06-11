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
