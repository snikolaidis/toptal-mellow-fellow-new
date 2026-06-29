import { gql } from '@apollo/client';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

/**
 * Backend-managed hero slider (ACF block `acf/hero-slider`). Replaces the
 * hardcoded HeroSwiper: slides come from WordPress, each with 3 responsive image
 * slots (mobile/tablet/desktop, mirroring SaleCountdownHero's responsive-banner)
 * and an optional link. Slider behavior (autoplay/loop/arrows/dots) is fixed
 * here — there are intentionally no backend settings for it.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface SlideImage {
  node?: MediaItem | null;
}

interface HeroSlide {
  link?: { url?: string | null; title?: string | null; target?: string | null } | null;
  mobileImage?: SlideImage | null;
  tabletImage?: SlideImage | null;
  desktopImage?: SlideImage | null;
}

interface HeroSliderProps {
  heroSlider?: {
    slides?: HeroSlide[] | null;
  } | null;
}

function SlidePicture({ slide }: { slide: HeroSlide }) {
  const { mobileImage, tabletImage, desktopImage } = slide;
  const fallback = mobileImage || tabletImage || desktopImage;
  if (!fallback?.node?.sourceUrl) return null;

  return (
    <div className="responsive-banner__wrapper">
      <picture>
        {desktopImage?.node?.sourceUrl && (
          <source media="(width >= 1024px)" srcSet={desktopImage.node.sourceUrl} />
        )}
        {tabletImage?.node?.sourceUrl && (
          <source media="(width >= 768px)" srcSet={tabletImage.node.sourceUrl} />
        )}
        {mobileImage?.node?.sourceUrl && (
          <source media="(width < 768px)" srcSet={mobileImage.node.sourceUrl} />
        )}
        <img
          className="responsive-banner__image"
          src={fallback.node.sourceUrl}
          alt={fallback.node.altText || ''}
          width={fallback.node.mediaDetails?.width ?? undefined}
          height={fallback.node.mediaDetails?.height ?? undefined}
          loading="eager"
        />
      </picture>
    </div>
  );
}

export default function HeroSlider(props: HeroSliderProps) {
  const slides = props.heroSlider?.slides ?? [];
  if (slides.length === 0) {
    return null;
  }

  return (
    <div className="hero-slider">
      <Swiper
        modules={[Autoplay, Pagination, Navigation]}
        pagination={{ clickable: true }}
        navigation
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        loop
      >
        {slides.map((slide, i) => {
          const url = slide.link?.url;
          const picture = <SlidePicture slide={slide} />;
          return (
            <SwiperSlide key={i}>
              {url ? (
                <a
                  href={url}
                  target={slide.link?.target || undefined}
                  rel={slide.link?.target === '_blank' ? 'noopener noreferrer' : undefined}
                >
                  {picture}
                </a>
              ) : (
                picture
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}

HeroSlider.displayName = 'AcfHeroSlider';

HeroSlider.fragments = {
  key: `AcfHeroSliderFragment`,
  entry: gql`
    fragment AcfHeroSliderFragment on AcfHeroSlider {
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
