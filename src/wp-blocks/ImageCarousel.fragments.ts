import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfImageCarouselFragment`,
  entry: gql`
    fragment AcfImageCarouselFragment on AcfImageCarousel {
      imageCarousel {
        title
        images {
          nodes {
            altText
            sourceUrl
            mediaDetails {
              width
              height
            }
          }
        }
        link {
          url
          title
          target
        }
        linkStyle
        backgroundVariant
      }
    }
  `,
};
