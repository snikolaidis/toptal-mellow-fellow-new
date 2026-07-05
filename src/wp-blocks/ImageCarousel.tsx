import { gql } from '@apollo/client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

/**
 * Backend-managed image carousel (ACF block `acf/image-carousel`). Replaces
 * the hardcoded FeaturedIn component: the title and images (an ACF gallery
 * field) come from WordPress, while the carousel behaviour is fixed here —
 * autoplay every 5s, loop, 2 slides on mobile and all images visible from
 * 768px up — matching the original FeaturedIn exactly.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface ImageCarouselProps {
  imageCarousel?: {
    title?: string | null;
    images?: { nodes?: MediaItem[] | null } | null;
  } | null;
}

export default function ImageCarousel(props: ImageCarouselProps) {
  const title = props.imageCarousel?.title;
  const images = (props.imageCarousel?.images?.nodes ?? []).filter(
    (img): img is MediaItem => Boolean(img?.sourceUrl)
  );
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="section featured-in">
      {title && <h3 className="section__title">{title}</h3>}

      <Swiper
        slidesPerView={2}
        spaceBetween={30}
        modules={[Autoplay]}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        loop
        breakpoints={{
          768: {
            slidesPerView: images.length,
          },
        }}
      >
        {images.map((img, i) => (
          <SwiperSlide key={i}>
            <img
              src={img.sourceUrl ?? undefined}
              alt={img.altText || ''}
              width={img.mediaDetails?.width ?? undefined}
              height={img.mediaDetails?.height ?? undefined}
              loading="lazy"
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}

ImageCarousel.displayName = 'AcfImageCarousel';

ImageCarousel.fragments = {
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
      }
    }
  `,
};
