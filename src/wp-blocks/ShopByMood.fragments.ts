import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfShopByMoodFragment`,
  entry: gql`
    fragment AcfShopByMoodFragment on AcfShopByMood {
      shopByMood {
        heading
        subheading
        cards {
          label
          link {
            url
            title
            target
          }
          image {
            node {
              id
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
    }
  `,
};
