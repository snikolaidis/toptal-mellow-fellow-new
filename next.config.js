const { withFaust } = require('@faustwp/core');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      { protocol: 'http', hostname: 'headless-e-comm.local' }
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.authorize.net https://jstest.authorize.net https://*.klaviyo.com https://*.yotpo.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.yotpo.com",
          "font-src 'self' data: https://fonts.gstatic.com https://*.klaviyo.com https://*.yotpo.com",
          "img-src 'self' data: https://*.wpengine.com https://*.wpenginepowered.com https://cdn.shopify.com https://*.klaviyo.com https://*.yotpo.com",
          "connect-src 'self' https://*.wpengine.com https://*.wpenginepowered.com https://js.authorize.net https://jstest.authorize.net https://api.authorize.net https://apitest.authorize.net https://*.klaviyo.com https://*.yotpo.com",
          "frame-src 'self' https://*.yotpo.com",
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
