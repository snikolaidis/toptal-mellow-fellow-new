import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfCollectionSliderFragment`,
  entry: gql`
    fragment AcfCollectionSliderFragment on AcfCollectionSlider {
      collectionSlider {
        title
        productCount
        backgroundVariant
        filterGroup
        collection {
          nodes {
            __typename
            ... on Collection {
              databaseId
              name
              slug
            }
          }
        }
      }
    }
  `,
};
