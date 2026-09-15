import { gql } from '@apollo/client';

export const GET_BYOB_BUNDLE_BY_SLUG = gql`
  query GetByobBundleBySlug($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      databaseId
      name
      slug
      image {
        sourceUrl
        altText
      }
      ... on SimpleProduct {
        bbBundleMode
        bbDescription
        bbMinItems
        bbMaxItems
        bbDiscountRules {
          minQty
          percent
        }
        bbBundleProducts {
          databaseId
          name
          sku
          ... on SimpleProduct {
            price
            regularPrice
            image {
              sourceUrl
              altText
            }
          }
        }
      }
      ... on VariableProduct {
        bbBundleMode
        bbDescription
        bbMinItems
        bbMaxItems
        bbDiscountRules {
          minQty
          percent
        }
        bbBundleProducts {
          databaseId
          name
          sku
          ... on SimpleProduct {
            price
            regularPrice
            image {
              sourceUrl
              altText
            }
          }
        }
      }
      ... on ExternalProduct {
        bbBundleMode
        bbDescription
        bbMinItems
        bbMaxItems
        bbDiscountRules {
          minQty
          percent
        }
        bbBundleProducts {
          databaseId
          name
          sku
          ... on SimpleProduct {
            price
            regularPrice
            image {
              sourceUrl
              altText
            }
          }
        }
      }
      ... on GroupProduct {
        bbBundleMode
        bbDescription
        bbMinItems
        bbMaxItems
        bbDiscountRules {
          minQty
          percent
        }
        bbBundleProducts {
          databaseId
          name
          sku
          ... on SimpleProduct {
            price
            regularPrice
            image {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;
