import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfCollectionLinksFragment`,
  entry: gql`
    fragment AcfCollectionLinksFragment on AcfCollectionLinks {
      collectionLinks {
        sectionHeading
        layout
        links {
          titleOverride
          collection {
            nodes {
              __typename
              ... on Collection {
                name
                uri
                slug
                collectionFields {
                  thumbnailImage {
                    node {
                      sourceUrl
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
};
