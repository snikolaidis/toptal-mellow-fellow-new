import {
  CSSProperties,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ANNOUNCEMENT_ITEMS, AnnouncementItem } from './announcementItems';

interface AnnouncementBarProps {
  items?: AnnouncementItem[];
  isVisible?: boolean;
}

const FADE_INTERVAL_MS = 5000;
const TICKER_SPEED_PX_S = 50;
const MIN_COPIES = 2;

// Must match the SCSS: the ticker is touch width only, and reduced motion swaps
// it for the fade.
const FADE_QUERY = '(max-width: 1023px) and (prefers-reduced-motion: reduce)';

function itemContent(item: AnnouncementItem) {
  const sourceUrl = item.icon?.node?.sourceUrl;
  return (
    <>
      {sourceUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceUrl}
          alt={item.icon?.node?.altText || ''}
          width={16}
          height={16}
          className="site-header__announce-icon"
        />
      )}
      {item.label && (
        <span className="site-header__announce-label">{item.label}</span>
      )}
    </>
  );
}

export default function AnnouncementBar({
  items,
  isVisible = true,
}: AnnouncementBarProps) {
  const resolved = items && items.length > 0 ? items : ANNOUNCEMENT_ITEMS;

  const [isLatched, setIsLatched] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [fades, setFades] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copies, setCopies] = useState(MIN_COPIES);
  const [duration, setDuration] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);

  const isPaused = isLatched || isHovered || !isVisible;

  useEffect(() => {
    const query = window.matchMedia(FADE_QUERY);
    const sync = () => setFades(query.matches);

    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.offsetWidth;
      if (!width) return;
      setDuration(width / TICKER_SPEED_PX_S);
      setCopies(
        Math.max(MIN_COPIES, Math.ceil((2 * window.innerWidth) / width))
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resolved]);

  useEffect(() => {
    if (!fades || isPaused || resolved.length < 2) return;

    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % resolved.length);
    }, FADE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [fades, isPaused, resolved.length]);

  if (resolved.length === 0) {
    return null;
  }

  const toggleLatch = () => setIsLatched((prev) => !prev);

  const togglePause = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    toggleLatch();
  };

  const trackStyle = {
    '--sh-ticker-copies': copies,
    ...(duration ? { '--sh-ticker-duration': `${duration}s` } : null),
  } as CSSProperties;

  return (
    <div
      className={`site-header__announce${isPaused ? ' is-paused' : ''}`}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onPointerCancel={() => setIsHovered(false)}
      onClick={togglePause}
    >
      <button
        type="button"
        className="site-header__announce-pause is-sr-only"
        onClick={toggleLatch}
      >
        {isLatched ? 'Resume announcements' : 'Pause announcements'}
      </button>

      <div className="site-header__announce-viewport">
        <div className="site-header__announce-track" style={trackStyle}>
          {Array.from({ length: copies }, (_, copy) => {
            const isClone = copy > 0;

            return (
              <ul
                key={copy}
                ref={isClone ? undefined : trackRef}
                className="site-header__announce-list"
                aria-hidden={isClone || undefined}
              >
                {resolved.map((item, index) => (
                  <li
                    key={`${copy}-${item.label || index}`}
                    className={
                      !isClone && index === activeIndex
                        ? 'site-header__announce-item is-active'
                        : 'site-header__announce-item'
                    }
                    style={
                      item.labelColor
                        ? ({
                            '--sh-announce-item-color': item.labelColor,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {!isClone && item.link?.url ? (
                      <a
                        href={item.link.url}
                        className="site-header__announce-link"
                      >
                        {itemContent(item)}
                      </a>
                    ) : (
                      itemContent(item)
                    )}
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      </div>
    </div>
  );
}
