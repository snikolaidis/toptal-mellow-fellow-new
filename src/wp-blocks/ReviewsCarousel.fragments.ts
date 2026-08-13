import { gql } from '@apollo/client';

export const fragments = {
  key: `AcfReviewsCarouselFragment`,
  entry: gql`
    fragment AcfReviewsCarouselFragment on AcfReviewsCarousel {
      reviewsCarousel {
        title
      }
    }
  `,
};
