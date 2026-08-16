import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfHeroSectionFragment`,
  entry: gql`
    fragment AcfHeroSectionFragment on AcfHeroSection {
      heroSection {
        heading
        subheading
        backgroundImage {
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
        ctaButton {
          url
          title
          target
        }
      }
    }
  `,
};
