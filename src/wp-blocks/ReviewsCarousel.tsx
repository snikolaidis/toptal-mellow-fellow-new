import { useState, useEffect } from 'react';
import { gql } from '@apollo/client';

interface ReviewsCarouselProps {
  reviewsCarousel?: {
    title?: string | null;
  } | null;
}

export default function ReviewsCarousel(props: ReviewsCarouselProps) {
  const title = props.reviewsCarousel?.title || 'What Our Customers are Saying:';
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
  }

  return (
    <section className="section reviews-carousel">
      <div className="container">
        <h3 className="section__title">{title}</h3>
        <div id="klaviyo-featured-reviews-carousel" />
      </div>
    </section>
  );
}

ReviewsCarousel.displayName = 'AcfReviewsCarousel';

ReviewsCarousel.fragments = {
  key: `AcfReviewsCarouselFragment`,
  entry: gql`
    fragment AcfReviewsCarouselFragment on AcfReviewsCarousel {
      reviewsCarousel {
        title
      }
    }
  `,
};
