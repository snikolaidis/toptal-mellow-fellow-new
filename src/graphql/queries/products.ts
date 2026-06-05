import { gql } from '@apollo/client';

// WooGraphQL returns products as a union type, so we need inline fragments for each type
export const SIMPLE_PRODUCT_FIELDS = gql`
  fragment SimpleProductFields on SimpleProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    stockStatus
    stockQuantity
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    productDetails {
      lineCollection
      experienceType
      strainName
      strainType
    }
  }
`;

export const VARIABLE_PRODUCT_FIELDS = gql`
  fragment VariableProductFields on VariableProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    stockStatus
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    variations {
      nodes {
        id
        databaseId
        name
        price
        regularPrice
        salePrice
        stockStatus
        attributes {
          nodes {
            name
            value
          }
        }
      }
    }
  }
`;

export const EXTERNAL_PRODUCT_FIELDS = gql`
  fragment ExternalProductFields on ExternalProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    externalUrl
    buttonText
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
  }
`;

export const GROUP_PRODUCT_FIELDS = gql`
  fragment GroupProductFields on GroupProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
  }
`;

export const GET_PRODUCTS = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProducts($first: Int = 12, $after: String, $orderby: [ProductsOrderbyInput]) {
    products(first: $first, after: $after, where: { status: "publish", orderby: $orderby }) {
      pageInfo {
        hasNextPage
        endCursor
      }
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

export const GET_PRODUCT_BY_SLUG = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductBySlug($slug: ID!) {
    product(id: $slug, idType: SLUG) {
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
`;

export const GET_ALL_PRODUCT_SLUGS = gql`
  query GetAllProductSlugs {
    products(first: 100, where: { status: "publish" }) {
      nodes {
        ... on SimpleProduct {
          id
          databaseId
          slug
        }
        ... on VariableProduct {
          id
          databaseId
          slug
        }
        ... on ExternalProduct {
          id
          databaseId
          slug
        }
        ... on GroupProduct {
          id
          databaseId
          slug
        }
      }
    }
  }
`;

export const GET_PRODUCT_CATEGORIES = gql`
  query GetProductCategories {
    productCategories(first: 100) {
      nodes {
        id
        databaseId
        name
        slug
        count
      }
    }
  }
`;

export const GET_PRODUCTS_BY_CATEGORY = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductsByCategory($categorySlug: String!, $first: Int = 12, $after: String, $orderby: [ProductsOrderbyInput]) {
    products(
      first: $first
      after: $after
      where: { category: $categorySlug, status: "publish", orderby: $orderby }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
