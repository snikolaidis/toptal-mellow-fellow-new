import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfPromoSliderFragment`,
  entry: gql`
    fragment AcfPromoSliderFragment on AcfPromoSlider {
      promoSlider {
        slides {
          heading
          subheading
          buttonText
          buttonLink {
            url
            title
            target
          }
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
        }
      }
    }
  `,
};
