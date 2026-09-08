import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfHeroSliderFragment`,
  entry: gql`
    fragment AcfHeroSliderFragment on AcfHeroSlider {
      sharedSlides {
        slides {
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
          tabletImage {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
          desktopImage {
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
      heroSlider {
        slides {
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
          tabletImage {
            node {
              altText
              sourceUrl
              mediaDetails {
                width
                height
              }
            }
          }
          desktopImage {
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
