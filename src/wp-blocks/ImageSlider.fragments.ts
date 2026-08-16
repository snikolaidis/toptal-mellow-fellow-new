import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfImageSliderFragment`,
  entry: gql`
    fragment AcfImageSliderFragment on AcfImageSlider {
      imageSlider {
        globalTitle
        slides {
          heading
          subheading
          tertiaryHeading
          textColor
          link {
            url
            title
            target
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
