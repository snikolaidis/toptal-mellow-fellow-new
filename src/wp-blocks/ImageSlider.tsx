import { gql } from '@apollo/client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import 'swiper/css';

/**
 * Backend-managed image slider (ACF block `acf/image-slider`). Migrated from
 * the Shopify `image-slider` section — draggable/loopable via Swiper (no
 * arrows, no dots) — see src/styles/blocks/_image-slider.scss. Each slide is
 * an image card with overlay text in a per-slide color and an optional link.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface Slide {
  image?: { node?: MediaItem | null } | null;
  heading?: string | null;
  subheading?: string | null;
  tertiaryHeading?: string | null;
  textColor?: string | null;
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
}

interface ImageSliderProps {
  imageSlider?: {
    globalTitle?: string | null;
    slides?: Slide[] | null;
  } | null;
}

function SlideCard({ slide }: { slide: Slide }) {
  const media = slide.image?.node;
  if (!media?.sourceUrl) return null;

  const content = (
    <>
      <img
        className="image-slider__image"
        src={media.sourceUrl}
        alt={media.altText || slide.heading || ''}
        width={media.mediaDetails?.width ?? undefined}
        height={media.mediaDetails?.height ?? undefined}
        loading="lazy"
      />
      {(slide.heading || slide.subheading || slide.tertiaryHeading) && (
        <div
          className="image-slider__text-content"
          style={slide.textColor ? { color: slide.textColor } : undefined}
        >
          {slide.heading && <h2 className="image-slider__heading">{slide.heading}</h2>}
          {slide.subheading && <p className="image-slider__subheading">{slide.subheading}</p>}
          {slide.tertiaryHeading && (
            <h3 className="image-slider__tertiary-heading">{slide.tertiaryHeading}</h3>
          )}
        </div>
      )}
    </>
  );

  const url = slide.link?.url;
  if (url) {
    return (
      <a
        className="image-slider__card"
        href={url}
        target={slide.link?.target || undefined}
        rel={slide.link?.target === '_blank' ? 'noopener noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }
  return <div className="image-slider__card">{content}</div>;
}

export default function ImageSlider(props: ImageSliderProps) {
  const globalTitle = props.imageSlider?.globalTitle;
  const slides = props.imageSlider?.slides ?? [];
  if (slides.length === 0) {
    return null;
  }

  return (
    <section className="image-slider">
      {globalTitle && (
        <div className="container is-fluid">
          <h3 className="image-slider__title">{globalTitle}</h3>
        </div>
      )}

      <Swiper
        modules={[Mousewheel]}
        className="image-slider__track"
        slidesPerView={1.33}
        spaceBetween={20}
        loop
        grabCursor
        mousewheel={{ enabled: true, forceToAxis: true, thresholdDelta: 5 }}
        breakpoints={{
          600: { slidesPerView: 2 },
          900: { slidesPerView: 2.5 },
          1200: { slidesPerView: 3.33 },
        }}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={i}>
            <SlideCard slide={slide} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

ImageSlider.displayName = 'AcfImageSlider';

ImageSlider.fragments = {
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
