import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfShopByMoodFragment`,
  entry: gql`
    fragment AcfShopByMoodFragment on AcfShopByMood {
      moodTerms {
        databaseId
        name
        slug
        imageUrl
        imageAlt
        imageWidth
        imageHeight
      }
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
