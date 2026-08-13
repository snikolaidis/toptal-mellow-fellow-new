import type { CSSProperties } from 'react';
import { fragments } from './CollectionCardsSet.fragments';
import { useEffect, useRef, useState } from 'react';

/**
 * Backend-managed collection cards grid (ACF block `acf/collection-cards-set`).
 * Migrated from the Shopify `collection-cards-set` section + `_collection-card`
 * block: a responsive grid of cards (mobile/desktop image, link, preface/
 * title/price overlay text), with an optional visibility schedule window.
 *
 * Unlike ValuePropsSet, each placement of this block has its own cards — the
 * ACF field group lives on the block itself (`location: block`), so this
 * follows the CollectionLinks.tsx per-block-fragment pattern, not the global
 * siteSettings pattern.
 *
 * Scheduling: `startDateTime`/`endDateTime` are RFC3339 strings from ACF's
 * date_time_picker (same assumption as SaleCountdownHero.tsx — verify in
 * GraphiQL that the offset matches this site's configured timezone). Unlike
 * the countdown hero's single end-threshold, this needs a start+end window,
 * so a plain visibility check (not a per-second display) suffices — a single
 * setTimeout to the next relevant boundary re-runs the check, rather than
 * ticking every second.
 */

interface MediaItem {
  altText?: string | null;
  sourceUrl?: string | null;
  mediaDetails?: { width?: number | null; height?: number | null } | null;
}

interface CardLink {
  url?: string | null;
  title?: string | null;
  target?: string | null;
}

interface Card {
  mobileImage?: { node?: MediaItem | null } | null;
  image?: { node?: MediaItem | null } | null;
  link?: CardLink | null;
  preface?: string | null;
  title?: string | null;
  price?: string | null;
  contentColor?: string | null;
}

interface CollectionCardsSetProps {
  collectionCardsSet?: {
    maxPerRow?: number | null;
    stackOnMobile?: boolean | null;
    isScheduled?: boolean | null;
    startDateTime?: string | null;
    endDateTime?: string | null;
    cards?: Card[] | null;
  } | null;
}

function getVisibility(now: number, start: Date | null, end: Date | null): boolean {
  if (start && now < start.getTime()) return false;
  if (end && now > end.getTime()) return false;
  return true;
}

function nextBoundaryDelay(now: number, start: Date | null, end: Date | null): number | null {
  const boundaries = [start, end]
    .filter((d): d is Date => !!d)
    .map((d) => d.getTime())
    .filter((t) => t > now);
  if (boundaries.length === 0) return null;
  return Math.min(...boundaries) - now;
}

/**
 * Card links can point at an in-page anchor (e.g. `#exotic-thcs-flower`, set
 * to match a ShoppableHero's HTML Anchor further down the same page) instead
 * of navigating away. Intercepts clicks on hash-only links within this
 * block's own container and smooth-scrolls to the target element, scoped
 * here rather than attached globally to every link on the page.
 */
function useAnchorScrollLinks(containerRef: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cleanups: (() => void)[] = [];

    container.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href?.startsWith('#')) return;

      const scrollToEl = document.getElementById(href.slice(1));
      if (!scrollToEl) return;

      const handleClick = (e: MouseEvent) => {
        e.preventDefault();
        scrollToEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const addedTabIndex = !scrollToEl.hasAttribute('tabindex');
        if (addedTabIndex) scrollToEl.setAttribute('tabindex', '-1');

        scrollToEl.focus({ preventScroll: true });

        if (addedTabIndex) {
          scrollToEl.addEventListener(
            'blur',
            () => scrollToEl.removeAttribute('tabindex'),
            { once: true }
          );
        }
      };

      link.addEventListener('click', handleClick);
      cleanups.push(() => link.removeEventListener('click', handleClick));
    });

    return () => cleanups.forEach((cleanup) => cleanup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function CardItem({ card }: { card: Card }) {
  const desktop = card.image?.node;
  const mobile = card.mobileImage?.node;
  const fallback = desktop || mobile;
  if (!fallback?.sourceUrl) return null;

  const fullTitle = [card.preface, card.title, card.price].filter(Boolean).join(' ');
  const imageAlt = fullTitle ? '' : fallback.altText || 'Collection card image';

  const content = (
    <>
      <picture>
        {mobile?.sourceUrl && <source media="(width < 1024px)" srcSet={mobile.sourceUrl} />}
        {desktop?.sourceUrl && <source media="(width >= 1024px)" srcSet={desktop.sourceUrl} />}
        <img
          src={fallback.sourceUrl}
          alt={imageAlt}
          width={fallback.mediaDetails?.width ?? undefined}
          height={fallback.mediaDetails?.height ?? undefined}
          loading="lazy"
        />
      </picture>

      <div
        className="collection-cards-set__card__content"
        style={card.contentColor ? { color: card.contentColor } : undefined}
      >
        {card.preface && <p className="collection-cards-set__card__preface">{card.preface}</p>}
        {card.title && <h4 className="collection-cards-set__card__title">{card.title}</h4>}
        {card.price && <p className="collection-cards-set__card__price">{card.price}</p>}
      </div>
    </>
  );

  return (
    <div className="collection-cards-set__card">
      {card.link?.url ? (
        <a
          href={card.link.url}
          target={card.link.target || undefined}
          rel={card.link.target === '_blank' ? 'noopener noreferrer' : undefined}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}

export default function CollectionCardsSet(props: CollectionCardsSetProps) {
  const data = props.collectionCardsSet;
  const isScheduled = !!data?.isScheduled;
  const startDate = data?.startDateTime ? new Date(data.startDateTime) : null;
  const endDate = data?.endDateTime ? new Date(data.endDateTime) : null;

  // null = not yet determined client-side (avoids a hydration flash).
  const [visible, setVisible] = useState<boolean | null>(isScheduled ? null : true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isScheduled) {
      setVisible(true);
      return;
    }

    function check() {
      const now = Date.now();
      setVisible(getVisibility(now, startDate, endDate));

      const delay = nextBoundaryDelay(now, startDate, endDate);
      if (delay !== null) {
        timeoutRef.current = setTimeout(check, delay + 50);
      }
    }

    check();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduled, startDate?.getTime(), endDate?.getTime()]);

  const cards = data?.cards ?? [];
  const trackRef = useRef<HTMLDivElement>(null);

  useAnchorScrollLinks(trackRef, [cards]);

  if (!data || cards.length === 0 || visible === false || visible === null) {
    return null;
  }

  const numPerRowMobile = data.stackOnMobile ? 1 : 2;
  const numPerRowDesktop = Math.min(cards.length, data.maxPerRow || 4);

  return (
    <section className="collection-cards-set section">
      <div className="container">
        <div
          ref={trackRef}
          className="collection-cards-set__track"
          style={
            {
              '--num-per-row-mobile': numPerRowMobile,
              '--num-per-row-desktop': numPerRowDesktop,
            } as CSSProperties
          }
        >
          {cards.map((card, i) => (
            <CardItem key={i} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

CollectionCardsSet.displayName = 'AcfCollectionCardsSet';

CollectionCardsSet.fragments = fragments;
