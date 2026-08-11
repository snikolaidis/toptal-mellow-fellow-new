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

interface LinkField {
  url?: string | null;
  title?: string | null;
  target?: string | null;
}

interface ImageCarouselProps {
  imageCarousel?: {
    title?: string | null;
    images?: { nodes?: MediaItem[] | null } | null;
    link?: LinkField | null;
    linkStyle?: string | null;
    backgroundVariant?: string | null;
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

  const link = props.imageCarousel?.link;
  const linkUrl = link?.url;
  const wholeCarouselClickable = linkUrl && props.imageCarousel?.linkStyle === 'whole_carousel';

  const variantClass =
    props.imageCarousel?.backgroundVariant === 'featured_bar'
      ? ' image-carousel--featured-bar'
      : '';

  const carousel = (
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
  );

  if (wholeCarouselClickable) {
    return (
      <a
        className={`image-carousel image-carousel--linked${variantClass}`}
        href={linkUrl!}
        target={link?.target || undefined}
        rel={link?.target === '_blank' ? 'noopener noreferrer' : undefined}
      >
        {title && <h3 className="section__title">{title}</h3>}
        {carousel}
      </a>
    );
  }

  return (
    <section className={`image-carousel${variantClass}`}>
      <div className="container">
        {title && <h3 className="section__title">{title}</h3>}
        {carousel}
        {linkUrl && (
          <a
            className="image-carousel__learn-more btn-secondary"
            href={linkUrl}
            target={link?.target || undefined}
            rel={link?.target === '_blank' ? 'noopener noreferrer' : undefined}
          >
            {link?.title || 'Learn more'}
          </a>
        )}
      </div>
    </section>
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
