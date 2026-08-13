import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfBlendCalloutFragment`,
  entry: gql`
    fragment AcfBlendCalloutFragment on AcfBlendCallout {
      blendCallout {
        heading
        description
        image {
          node {
            sourceUrl
            altText
            mediaDetails {
              width
              height
            }
          }
        }
        learnLink {
          url
          title
          target
        }
        shopLink {
          url
          title
          target
        }
      }
    }
  `,
};
