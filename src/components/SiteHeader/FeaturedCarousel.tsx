import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MegaMenuSlide } from './megaMenuModel';

/**
 * Hand rolled rather than Swiper, which the hero block uses: this mounts with
 * the header on every page, and swiper plus two of its stylesheets is a lot of
 * weight for one image and five dots. The dots reuse the hero slider's
 * treatment through the shared slider-dot mixins.
 */

interface FeaturedCarouselProps {
  slides: MegaMenuSlide[];
  variant: 'mega' | 'mobile';
}

const ADVANCE_MS = 5000;

const DESKTOP_MEDIA = '(width >= 1024px)';
const TABLET_MEDIA = '(width >= 768px)';
const MOBILE_MEDIA = '(width < 768px)';

export default function FeaturedCarousel({
  slides,
  variant,
}: FeaturedCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      ADVANCE_MS
    );
    return () => window.clearInterval(id);
  }, [slides.length, paused]);

  // Re-authoring in wp-admin can shorten the list under a parked index.
  const current = slides[index] ?? slides[0];
  if (!current) return null;

  const { caption, url, target, desktop, tablet, mobile, fallback } = current;

  // The mega box is near square and only the mobile slot is, so it takes that
  // slot rather than the viewport's: the 2.2:1 desktop file would crop to under
  // half its width. No sources leaves the <img>, already mobile ?? tablet ??
  // desktop.
  const artDirected = variant === 'mobile';

  const picture = (
    <span className="site-header__promo-frame">
      <picture>
        {artDirected && desktop && (
          <source media={DESKTOP_MEDIA} srcSet={desktop.src} />
        )}
        {artDirected && tablet && (
          <source media={TABLET_MEDIA} srcSet={tablet.src} />
        )}
        {artDirected && mobile && (
          <source media={MOBILE_MEDIA} srcSet={mobile.src} />
        )}
        <img
          className="site-header__promo-image"
          src={fallback.src}
          alt={fallback.alt}
          width={fallback.width}
          height={fallback.height}
          loading="lazy"
          decoding="async"
        />
      </picture>
      {caption && <span className="site-header__promo-caption">{caption}</span>}
    </span>
  );

  return (
    <div
      className={`site-header__promo site-header__promo--${variant}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {url ? (
        <Link
          href={url}
          className="site-header__promo-link"
          target={target}
          rel={target === '_blank' ? 'noreferrer' : undefined}
          aria-label={caption || fallback.alt || 'Featured promotion'}
        >
          {picture}
        </Link>
      ) : (
        picture
      )}

      {slides.length > 1 && (
        <div
          className="site-header__promo-dots"
          role="group"
          aria-label="Featured promotions"
        >
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              className={`site-header__promo-dot${
                i === index ? ' is-active' : ''
              }`}
              aria-label={slide.caption || `Promotion ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
