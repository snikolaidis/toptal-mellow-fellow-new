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
    ],
  },
  // Enable experimental features for better performance
  experimental: {
    scrollRestoration: true,
  },
};

module.exports = withFaust(nextConfig);
