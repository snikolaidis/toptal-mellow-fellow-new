import { ANNOUNCEMENT_ITEMS, AnnouncementItem } from './announcementItems';

interface AnnouncementBarProps {
  items?: AnnouncementItem[];
}

export default function AnnouncementBar({ items }: AnnouncementBarProps) {
  const resolved = items && items.length > 0 ? items : ANNOUNCEMENT_ITEMS;

  if (resolved.length === 0) {
    return null;
  }

  return (
    <div className="site-header__announce">
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
              // Mobile visibility is a class, not a conditional render: rendering
              // a different item count on the client than the server was rendered
              // with is a hydration mismatch.
              className={
                item.showOnMobile === false
                  ? 'site-header__announce-item is-desktop-only'
                  : 'site-header__announce-item'
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
