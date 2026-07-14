import { gql } from '@apollo/client';
import Link from 'next/link';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';

interface PromoSlide {
  heading?: string | null;
  subheading?: string | null;
  buttonText?: string | null;
  buttonLink?: { url?: string | null; title?: string | null; target?: string | null } | null;
  image?: {
    node?: {
      sourceUrl?: string | null;
      altText?: string | null;
      mediaDetails?: { width?: number | null; height?: number | null } | null;
    } | null;
  } | null;
}

interface PromoSliderProps {
  promoSlider?: {
    slides?: PromoSlide[] | null;
  } | null;
}

export default function PromoSlider(props: PromoSliderProps) {
  const slides = (props.promoSlider?.slides ?? []).filter((s) => s?.image?.node?.sourceUrl);

  if (slides.length === 0) {
    return null;
  }

  return (
    <section className="section promo-slider">
      <Swiper
        className="promo-slider__track"
        modules={[Navigation]}
        navigation
        slidesPerView={1}
        loop={slides.length > 1}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={i}>
            <div className="promo-slider__panel">
              <div className="promo-slider__media">
                <Image
                  src={slide.image!.node!.sourceUrl as string}
                  alt={slide.image?.node?.altText || slide.heading || ''}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="promo-slider__image"
                />
              </div>

              <div className="promo-slider__content">
                {slide.heading && <h2 className="promo-slider__heading">{slide.heading}</h2>}
                {slide.subheading && <p className="promo-slider__subheading">{slide.subheading}</p>}
                {slide.buttonText && slide.buttonLink?.url && (
                  <Link
                    href={slide.buttonLink.url}
                    target={slide.buttonLink.target || undefined}
                    className="promo-slider__button"
                  >
                    {slide.buttonText}
                  </Link>
                )}
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

PromoSlider.displayName = 'AcfPromoSlider';

PromoSlider.fragments = {
  key: `AcfPromoSliderFragment`,
  entry: gql`
    fragment AcfPromoSliderFragment on AcfPromoSlider {
      promoSlider {
        slides {
          heading
          subheading
          buttonText
          buttonLink {
            url
            title
            target
          }
          image {
            node {
              sourceUrl
              altText
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
