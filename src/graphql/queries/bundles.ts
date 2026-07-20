import { gql } from '@apollo/client';

export const GET_BUNDLE_BY_SLUG = gql`
  query GetBundleBySlug($slug: ID!) {
    bundleBuilder(id: $slug, idType: SLUG) {
      databaseId
      title(format: RENDERED)
      content(format: RENDERED)
      minItems
      maxItems
      bannerImageUrl
      shortcode
      discountRules {
        minQty
        percent
      }
      bundleProducts {
        databaseId
        name
        sku
        ... on SimpleProduct {
          price
          regularPrice
          stockStatus
          image {
            sourceUrl
            altText
          }
        }
      }
    }
  }
`;

// Resolve a bundle's slug from its databaseId — used to route a bb_bundle
// product's "Create Bundle" button, since the product's own slug is not
// necessarily the bundle's slug.
export const GET_BUNDLE_SLUG_BY_ID = gql`
  query GetBundleSlugById($id: ID!) {
    bundleBuilder(id: $id, idType: DATABASE_ID) {
      slug
    }
  }
`;

export const GET_ALL_BUNDLE_SLUGS = gql`
  query GetAllBundleSlugs {
    bundleBuilders {
      nodes {
        slug
      }
    }
  }
`;
