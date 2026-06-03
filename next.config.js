const { withFaust } = require('@faustwp/core');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.wpengine.com' },
      { protocol: 'https', hostname: '*.wpenginepowered.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'mf-headless-wp.local' }
    ],
  },
  experimental: {
    scrollRestoration: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.authorize.net https://jstest.authorize.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://*.wpengine.com https://*.wpenginepowered.com https://cdn.shopify.com",
              "connect-src 'self' https://*.wpengine.com https://*.wpenginepowered.com https://js.authorize.net https://jstest.authorize.net https://api.authorize.net https://apitest.authorize.net",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = withFaust(nextConfig);
