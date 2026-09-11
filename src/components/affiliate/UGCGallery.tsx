import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import VideoQuickView from './VideoQuickView';
import { Product } from '@/types/woocommerce';
import styles from './UGCGallery.module.css';

export interface UGCItem {
  id: string;
  videoUrl: string;
  posterUrl?: string | null;
  product: Product | null;
}

interface UGCGalleryProps {
  items: UGCItem[];
  size?: 'default' | 'large';
}

const SWIPE_THRESHOLD = 40;

export default function UGCGallery({ items, size = 'default' }: UGCGalleryProps) {
  if (!items || items.length === 0) return null;

  const N = items.length;

  // Triple-clone for infinite loop illusion
  const cloned = useMemo(() => [...items, ...items, ...items], [items]);

  // The item open in quick view is itself tagged, so Next needs more than one.
  const taggedCount = useMemo(() => items.filter((item) => item.product).length, [items]);

  const [displayIndex, setDisplayIndex] = useState(N);

  const [muted, setMuted] = useState(true);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewIndex, setQuickViewIndex] = useState(-1);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const wheelDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isTransitioning = useRef(false);
  const wrapPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrapGuard = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Directly set scrollLeft (no browser scroll-behavior interference)
  const setScrollCenter = useCallback((idx: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[idx] as HTMLElement;
    if (!card) return;
    const trackCenter = track.offsetWidth / 2;
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    track.scrollLeft = cardCenter - trackCenter;
  }, []);

  // Smooth scroll via requestAnimationFrame easing (avoids CSS scroll-behavior quirks)
  const smoothScrollTo = useCallback((idx: number, onDone?: () => void) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[idx] as HTMLElement;
    if (!card) return;
    const trackCenter = track.offsetWidth / 2;
    const target = card.offsetLeft + card.offsetWidth / 2 - trackCenter;
    const start = track.scrollLeft;
    const distance = target - start;
    if (Math.abs(distance) < 1) { onDone?.(); return; }

    const duration = 320;
    let startTime: number | null = null;

    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      track.scrollLeft = start + distance * ease(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        onDone?.();
      }
    };
    requestAnimationFrame(step);
  }, []);

  // Center on mount
  useEffect(() => {
    setScrollCenter(N);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exact index, not `i % N`: the modulo matched all three clones of the active
  // item, so three players ran and unmuting gave the same audio three times.
  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === displayIndex) {
        vid.muted = muted;
        vid.play().catch(() => {});
      } else {
        vid.pause();
        vid.muted = true;
      }
    });
  }, [displayIndex, muted]);

  const goTo = useCallback(
    (target: number) => {
      if (isTransitioning.current) return;

      const clamped = Math.max(0, Math.min(cloned.length - 1, target));
      if (clamped === displayIndex) return;

      isTransitioning.current = true;

      if (wrapPollRef.current) { clearInterval(wrapPollRef.current); wrapPollRef.current = null; }
      if (wrapGuard.current) { clearTimeout(wrapGuard.current); wrapGuard.current = null; }

      const corrected = (clamped % N) + N;

      smoothScrollTo(clamped, () => {
        if (clamped !== corrected) {
          const track = trackRef.current;
          if (track) {
            // Only one clone plays now, so the one we teleport onto sits at a stale
            // time. Carry it across or the video jumps backwards on every wrap.
            const from = videoRefs.current[clamped];
            const to = videoRefs.current[corrected];
            if (from && to) to.currentTime = from.currentTime;

            const cards = Array.from(track.children) as HTMLElement[];
            cards.forEach(c => { c.style.transition = 'none'; });
            setScrollCenter(corrected);
            setDisplayIndex(corrected);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                cards.forEach(c => { c.style.transition = ''; });
                isTransitioning.current = false;
              });
            });
          } else {
            isTransitioning.current = false;
          }
        } else {
          isTransitioning.current = false;
        }
      });

      setDisplayIndex(clamped);
    },
    [displayIndex, cloned.length, N, smoothScrollTo, setScrollCenter]
  );

  // Non-passive wheel listener — only handle horizontal
  useEffect(() => {
    const el = galleryRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!isHorizontal) return; // let vertical page scroll pass through
      e.preventDefault();
      if (wheelDebounce.current) return;
      goTo(displayIndex + (e.deltaX > 0 ? 1 : -1));
      wheelDebounce.current = setTimeout(() => { wheelDebounce.current = null; }, 350);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [goTo, displayIndex]);

  // Touch swipe — horizontal only
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
      goTo(displayIndex + (diffX > 0 ? 1 : -1));
    }
  };

  const openQuickView = (product: Product, clonedIdx: number) => {
    setQuickViewProduct(product);
    setQuickViewIndex(clonedIdx % N);
  };

  const closeQuickView = () => {
    setQuickViewProduct(null);
    setQuickViewIndex(-1);
  };

  const goToNextProduct = () => {
    for (let i = quickViewIndex + 1; i < N; i++) {
      if (items[i].product) { setQuickViewProduct(items[i].product); setQuickViewIndex(i); return; }
    }
    for (let i = 0; i < quickViewIndex; i++) {
      if (items[i].product) { setQuickViewProduct(items[i].product); setQuickViewIndex(i); return; }
    }
  };

  return (
    <div
      ref={galleryRef}
      className={`${styles.gallery} ${size === 'large' ? styles.galleryLarge : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={styles.track} ref={trackRef}>
        {cloned.map((item, clonedIdx) => {
          const isActive = clonedIdx === displayIndex;

          return (
            <div
              key={`${item.id}-${clonedIdx}`}
              className={`${styles.card} ${isActive ? styles.cardActive : styles.cardInactive}`}
              onClick={() => {
                if (!isActive) goTo(clonedIdx);
              }}
            >
              <div className={styles.videoWrap}>
                <video
                  ref={(el) => { videoRefs.current[clonedIdx] = el; }}
                  src={item.videoUrl}
                  poster={item.posterUrl || undefined}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className={styles.video}
                />
              </div>

              {isActive && (
                <button
                  className={styles.muteBtn}
                  onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.33-1.71-.7zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v1.79l2.48 2.48c.01-.08.02-.16.02-.24z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  )}
                </button>
              )}

              {isActive && item.product && (
                <button
                  className={styles.productChip}
                  onClick={(e) => { e.stopPropagation(); openQuickView(item.product!, clonedIdx); }}
                  aria-label={`View ${item.product.name}`}
                >
                  <div className={styles.chipThumb}>
                    {item.product.image?.sourceUrl ? (
                      <Image
                        src={item.product.image.sourceUrl}
                        alt={item.product.image.altText || item.product.name}
                        width={40}
                        height={40}
                        style={{ objectFit: 'contain' }}
                      />
                    ) : (
                      <div className={styles.chipThumbPlaceholder} />
                    )}
                  </div>
                  <div className={styles.chipInfo}>
                    <span className={styles.chipName}>{item.product.name}</span>
                    <span className={styles.chipPrice}>{item.product.price}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className={styles.chipArrow}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}

              {!isActive && <div className={styles.inactiveOverlay} />}
            </div>
          );
        })}
      </div>

      <div className={styles.navRow}>
        <button className={styles.navBtn} onClick={() => goTo(displayIndex - 1)} aria-label="Previous">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button className={styles.navBtn} onClick={() => goTo(displayIndex + 1)} aria-label="Next">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {quickViewProduct && (
        <VideoQuickView
          product={quickViewProduct}
          isOpen={true}
          onClose={closeQuickView}
          onNext={goToNextProduct}
          hasNext={taggedCount > 1}
        />
      )}
    </div>
  );
}
