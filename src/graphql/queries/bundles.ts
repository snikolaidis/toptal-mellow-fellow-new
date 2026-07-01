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

export const GET_ALL_BUNDLE_SLUGS = gql`
  query GetAllBundleSlugs {
    bundleBuilders {
      nodes {
        slug
      }
    }
  }
`;
