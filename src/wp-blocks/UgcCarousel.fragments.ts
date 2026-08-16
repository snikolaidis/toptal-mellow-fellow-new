import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfUgcCarouselFragment`,
  entry: gql`
    fragment AcfUgcCarouselFragment on AcfUgcCarousel {
      ugcCarousel {
        title
      }
    }
  `,
};
