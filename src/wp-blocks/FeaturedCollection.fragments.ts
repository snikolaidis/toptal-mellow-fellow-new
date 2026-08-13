import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfFeaturedCollectionFragment`,
  entry: gql`
    fragment AcfFeaturedCollectionFragment on AcfFeaturedCollection {
      featuredCollection {
        title
        productCount
        button {
          url
          title
          target
        }
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
