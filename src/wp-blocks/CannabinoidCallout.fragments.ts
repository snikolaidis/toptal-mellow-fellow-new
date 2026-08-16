import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfCannabinoidCalloutFragment`,
  entry: gql`
    fragment AcfCannabinoidCalloutFragment on AcfCannabinoidCallout {
      cannabinoidCallout {
        name
        description
        icon {
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
