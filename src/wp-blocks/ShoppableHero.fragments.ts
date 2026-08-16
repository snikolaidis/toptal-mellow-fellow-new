import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfShoppableHeroFragment`,
  entry: gql`
    fragment AcfShoppableHeroFragment on AcfShoppableHero {
      attributes {
        anchor
      }
      shoppableHero {
        customTitle
        customDescription
        contentAlignment
        product {
          nodes {
            __typename
            ... on SimpleProduct {
              databaseId
              name
              description
              stockStatus
            }
            ... on VariableProduct {
              databaseId
              name
              description
              stockStatus
              variations(first: 20) {
                nodes {
                  databaseId
                  stockStatus
                }
              }
            }
            ... on ExternalProduct {
              databaseId
              name
              description
            }
            ... on GroupProduct {
              databaseId
              name
              description
            }
          }
        }
        mobileImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        tabletImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        desktopImage {
          node {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
      }
    }
  `,
};
