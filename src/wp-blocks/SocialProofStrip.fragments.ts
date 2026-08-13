import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfSocialProofStripFragment`,
  entry: gql`
    fragment AcfSocialProofStripFragment on AcfSocialProofStrip {
      socialProofStrip {
        heading
        subheading
        thumbs {
          glowColor
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
