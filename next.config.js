if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
const { withFaust } = require('@faustwp/core');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  staticPageGenerationTimeout: 120,
  async rewrites() {
    return [
      {
        source: '/api/graphql',
        destination: `${process.env.NEXT_PUBLIC_WORDPRESS_URL}/graphql`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/blogs',
        has: [{ type: 'query', key: 'tag', value: '(?<tag>.*)' }],
        destination: '/blogs/tag/:tag',
        statusCode: 301,
      },
      // The WP "Collections" page also resolves through the /pages/ Faust
      // catch-all; its canonical home is the hardcoded /collections route.
      {
        source: '/pages/collections',
        destination: '/collections',
        statusCode: 301,
      },
      // The PDP moved from /product/ to /products/. Old URLs are still indexed
      // and linked externally, so keep them permanently redirected.
      {
        source: '/product/:slug',
        destination: '/products/:slug',
        statusCode: 301,
      },
      // Precautionary: unlike /product/ above, this was never a Shopify or
      // WordPress URL and is not in our sitemap. /collections/ does not match
      // this source, so there is no loop.
      {
        source: '/collection/:slug',
        destination: '/collections/:slug',
        statusCode: 301,
      },
      // The WordPress blog lived under /blogs/learn/; those URLs are still indexed.
      {
        source: '/blogs/learn/tag/:slug',
        destination: '/blogs/tag/:slug',
        statusCode: 301,
      },
      {
        source: '/blogs/learn',
        destination: '/blogs',
        statusCode: 301,
      },
      {
        source: '/blogs/learn/:slug',
        destination: '/blogs/:slug',
        statusCode: 301,
      },
      // Must stay below the :slug rule, which would otherwise never match. Catches
      // the leftover author, category and /page/N archives.
      {
        source: '/blogs/learn/:path*',
        destination: '/blogs',
        statusCode: 301,
      },
      // These three product_cat slugs have no `collection` term, so the generic
      // rules below 301 them into a 404. `:rest*` also matches zero segments.
      {
        source: '/product-category/beverages/:rest*',
        destination: '/collections/drinks',
        statusCode: 301,
      },
      {
        source: '/product-category/others/:rest*',
        destination: '/collections/all',
        statusCode: 301,
      },
      {
        source: '/product-category/flower-and-pre-rolls/:rest*',
        destination: '/collections/flower',
        statusCode: 301,
      },
      // product_cat terms mirror the product-type taxonomy, not the `collection`
      // one /collections/ reads, so these slugs were checked rather than assumed.
      {
        source: '/product-category/:slug',
        destination: '/collections/:slug',
        statusCode: 301,
      },
      {
        source: '/product-category/:slug/:rest*',
        destination: '/collections/:slug',
        statusCode: 301,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.wpengine.com' },
      { protocol: 'https', hostname: '*.wpenginepowered.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'mf-headless-wp.local' },
      { protocol: 'http', hostname: 'mf-headless-wp.local' },
      { protocol: 'https', hostname: 'headless-e-comm.local' },
      { protocol: 'http', hostname: 'headless-e-comm.local' },
      { protocol: 'https', hostname: 'mellowfellow.local' },
      { protocol: 'http', hostname: 'mellowfellow.local' }
    ],
  },
  experimental: {
    scrollRestoration: true,
    // One page per worker, defaulting to os.cpus() - 1, which reads the host's
    // cores in a container. WordPress has 20 PHP workers across all environments.
    cpus: 4,
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ];

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.authorize.net https://jstest.authorize.net https://*.klaviyo.com https://*.yotpo.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://idv.link https://unpkg.com https://*.dwin1.com https://*.awin1.com https://*.ladesk.com https://*.roeyecdn.com https://*.roeye.com https://*.bugherd.com",
          "style-src 'self' 'unsafe-inline' https://*.klaviyo.com https://fonts.googleapis.com https://*.yotpo.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://idv.link https://unpkg.com https://*.ladesk.com https://*.roeyecdn.com https://*.roeye.com https://*.bugherd.com",
          "font-src 'self' data: https://fonts.gstatic.com https://*.klaviyo.com https://*.yotpo.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://*.ladesk.com https://*.roeyecdn.com https://*.roeye.com",
          "img-src 'self' data: https://*.wpengine.com https://*.wpenginepowered.com https://cdn.shopify.com https://*.klaviyo.com https://*.yotpo.com https://*.yotpoapi.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://idv.link https://unpkg.com https://*.tile.openstreetmap.org https://*.awin1.com https://*.ladesk.com https://*.roeyecdn.com https://*.roeye.com https://*.bugherd.com https://res.cloudinary.com",
          "connect-src 'self' https://*.wpengine.com https://*.wpenginepowered.com https://js.authorize.net https://jstest.authorize.net https://api.authorize.net https://apitest.authorize.net https://*.klaviyo.com https://*.yotpo.com https://*.yotpoapi.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://idv.link https://*.awin1.com https://*.ladesk.com wss://*.ladesk.com https://*.roeyecdn.com wss://*.roeyecdn.com https://*.roeye.com wss://*.roeye.com https://*.bugherd.com https://*.lambda-url.us-east-1.on.aws https://real-id-identities.s3.amazonaws.com",
          "media-src 'self' https://*.wpengine.com https://*.wpenginepowered.com",
          "frame-src 'self' https://*.yotpo.com https://*.wpengine.com https://*.wpenginepowered.com https://*.getverdict.com https://*.idv.link https://idv.link https://*.ladesk.com https://*.roeyecdn.com https://*.roeye.com https://*.bugherd.com",
          "frame-ancestors 'none'",
        ].join('; '),
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withFaust(nextConfig);
