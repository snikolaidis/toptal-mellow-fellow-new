import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfCollectionCardsSetFragment`,
  entry: gql`
    fragment AcfCollectionCardsSetFragment on AcfCollectionCardsSet {
      collectionCardsSet {
        maxPerRow
        stackOnMobile
        isScheduled
        startDateTime
        endDateTime
        cards {
          preface
          title
          price
          contentColor
          link {
            url
            title
            target
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
          image {
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
    }
  `,
};
