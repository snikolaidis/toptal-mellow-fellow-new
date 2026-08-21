import { fragments } from './ImageCarousel.fragments';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';

/**
 * Backend-managed image carousel (ACF block `acf/image-carousel`). Replaces
 * the hardcoded FeaturedIn component: the title and images (an ACF gallery
 * field) come from WordPress, while the carousel behaviour is fixed here —
 * autoplay on a seamless loop, 2 slides on mobile and all images visible from
 * 768px up — matching the original FeaturedIn exactly.
 *
 * Swiper only loops when the track holds more slides than it shows at once, so
 * the images are repeated until there are enough for the widest breakpoint.
 */

const SLIDE_DELAY = 2500;
const MIN_TRACK_SLIDES = 12;

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
  // Starts false so the server and the first client render agree; the media
  // query result only lands after mount.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const title = props.imageCarousel?.title;
  const images = (props.imageCarousel?.images?.nodes ?? []).filter(
    (img): img is MediaItem => Boolean(img?.sourceUrl)
  );
  if (images.length === 0) {
    return null;
  }

  const copies = Math.max(3, Math.ceil(MIN_TRACK_SLIDES / images.length));
  const track = Array.from({ length: copies }, () => images).flat();

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
      autoplay={
        reduceMotion
          ? false
          : { delay: SLIDE_DELAY, disableOnInteraction: false, pauseOnMouseEnter: true }
      }
      loop
      allowTouchMove={false}
      breakpoints={{
        768: {
          slidesPerView: images.length,
        },
      }}
    >
      {track.map((img, i) => (
        <SwiperSlide key={i}>
          <Image
            src={img.sourceUrl!}
            alt={img.altText || ''}
            width={img.mediaDetails?.width ?? 200}
            height={img.mediaDetails?.height ?? 80}
            style={{ width: '100%', height: 'auto' }}
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

ImageCarousel.fragments = fragments;
