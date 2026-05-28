const links = [
  { id: 1, title: 'New', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' },
  { id: 2, title: 'Best Sellers', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' },
  { id: 3, title: 'Terp Sauce', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' },
  { id: 4, title: 'Blends Edibles', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' },
  { id: 5, title: 'Wellness', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' },
  { id: 6, title: 'Live Resin', href: 'https://mellowfellow.fun/collections/new-arrivals', thumbnail: 'https://mellowfellow.fun/cdn/shop/files/MF_Web_Assets_Thumbnails__New_Arrivals_543016ca-931a-43b4-a363-a383d3d78268.webp?v=1778189970&width=500' }
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