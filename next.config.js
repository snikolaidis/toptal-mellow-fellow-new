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
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.wpengine.com' },
      { protocol: 'https', hostname: '*.wpenginepowered.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'mf-headless-wp.local' },
      { protocol: 'https', hostname: 'headless-e-comm.local' },
      { protocol: 'http', hostname: 'headless-e-comm.local' },
      { protocol: 'https', hostname: 'mellowfellow.local' },
      { protocol: 'http', hostname: 'mellowfellow.local' }
    ],
  },
  experimental: {
    scrollRestoration: true,
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
          "connect-src 'self' https://*.wpengine.com https://*.wpenginepowered.com https://js.authorize.net https://jstest.authorize.net https://api.authorize.net https://apitest.authorize.net https://*.klaviyo.com https://*.yotpo.com https://*.yotpoapi.com https://skynettechnologies.com https://*.skynettechnologies.com https://*.skynettechnologies.us https://*.getverdict.com https://*.idv.link https://idv.link https://*.awin1.com https://*.ladesk.com wss://*.ladesk.com https://*.roeyecdn.com wss://*.roeyecdn.com https://*.roeye.com wss://*.roeye.com https://*.bugherd.com https://*.lambda-url.us-east-1.on.aws",
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
