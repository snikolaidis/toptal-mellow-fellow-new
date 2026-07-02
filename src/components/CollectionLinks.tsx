const links = [
  { id: 1, title: 'New', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' },
  { id: 2, title: 'Best Sellers', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' },
  { id: 3, title: 'Terp Sauce', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' },
  { id: 4, title: 'Blends Edibles', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' },
  { id: 5, title: 'Wellness', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' },
  { id: 6, title: 'Live Resin', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: '/images/Thumbnails__New_Arrivals.webp' }
];

export default function CollectionLinks() {
  return (
    <div className="collection-links">
      <div className="collection-links__track">
        <div className="collection-links__box">
          {links.map((link) => (
            <div className="collection-links__link" key={link.id}>
              <a href={ link.href }>
                <div className="collection-links__link-image">
                  <img src={ link.thumbnail } alt="" width="200" height="200" />
                </div>
                <span className="collection-links__link-title">
                  { link.title }
                </span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}