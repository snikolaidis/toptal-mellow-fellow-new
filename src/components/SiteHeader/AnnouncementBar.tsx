import { CSSProperties, useEffect, useState } from 'react';
import { ANNOUNCEMENT_ITEMS, AnnouncementItem } from './announcementItems';

interface AnnouncementBarProps {
  items?: AnnouncementItem[];
  isVisible?: boolean;
}

const ROTATE_INTERVAL_MS = 5000;

// Must match the SCSS rotator block, which uses Bulma's mixins.touch.
const ROTATE_QUERY = '(max-width: 1023px)';

export default function AnnouncementBar({
  items,
  isVisible = true,
}: AnnouncementBarProps) {
  const resolved = items && items.length > 0 ? items : ANNOUNCEMENT_ITEMS;

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [rotates, setRotates] = useState(false);

  useEffect(() => {
    const narrow = window.matchMedia(ROTATE_QUERY);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setRotates(narrow.matches && !reduced.matches);

    sync();
    narrow.addEventListener('change', sync);
    reduced.addEventListener('change', sync);
    return () => {
      narrow.removeEventListener('change', sync);
      reduced.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (!rotates) {
      setActiveIndex(0);
    }
  }, [rotates]);

  useEffect(() => {
    if (!rotates || isPaused || !isVisible || resolved.length < 2) return;

    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % resolved.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [rotates, isPaused, isVisible, resolved.length]);

  if (resolved.length === 0) {
    return null;
  }

  const pause = () => {
    if (rotates) setIsPaused(true);
  };
  const resume = () => {
    if (rotates) setIsPaused(false);
  };

  return (
    <div
      className="site-header__announce"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onPointerCancel={resume}
    >
      <ul className="site-header__announce-list">
        {resolved.map((item, index) => {
          const sourceUrl = item.icon?.node?.sourceUrl;
          const content = (
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

          return (
            <li
              key={item.label || index}
              className={
                index === activeIndex
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
              {item.link?.url ? (
                <a href={item.link.url} className="site-header__announce-link">
                  {content}
                </a>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
