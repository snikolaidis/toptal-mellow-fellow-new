/**
 * Maps a Next.js route path (`router.asPath` / `ctx.asPath`) to a
 * space-separated set of `<body>` classes, mirroring WordPress's
 * `body_class()` output so migrated SCSS can hook onto the template type and
 * the specific page (e.g. `body.page-mellow-day-2026 { ... }`).
 *
 * Used by both `_document` (server render) and `_app` (client navigation sync)
 * so the two stay in lockstep — keep this the single source of truth.
 */
export function getBodyClass(asPath: string): string {
  // Drop query string / hash and surrounding slashes, then split into segments.
  const path = (asPath || '/').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'home';
  }

  const [first, ...rest] = segments;
  const slug = segments[segments.length - 1];

  switch (first) {
    case 'pages':
      return `page page-${rest.join('-')}`;
    case 'product':
    case 'products':
      return `single single-product product-${slug}`;
    case 'collection':
    case 'collections':
      return rest.length
        ? `archive collection collection-${slug}`
        : 'archive collection collection-archive';
    case 'blogs':
      return rest.length ? `single single-post post-${slug}` : 'blog archive';
    case 'account':
      return rest.length ? `account account-${rest.join('-')}` : 'account';
    default:
      // Static/single routes: shop, cart, checkout, login, register,
      // store-locator, order-confirmation, etc.
      return `page page-${segments.join('-')}`;
  }
}
