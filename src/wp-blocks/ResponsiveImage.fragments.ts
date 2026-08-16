import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfResponsiveImageFragment`,
  entry: gql`
    fragment AcfResponsiveImageFragment on AcfResponsiveImage {
      responsiveImage {
        borderRadius
        width
        eagerLoad
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
  `,
};
