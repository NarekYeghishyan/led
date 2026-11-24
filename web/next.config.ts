import type { NextConfig } from 'next';

/** Where the NestJS API listens, as this server reaches it (Docker: http://api:3000). Never sent to the browser. */
const API_ORIGIN = process.env.API_ORIGIN ?? 'https://led.creativeweb.am';

const config: NextConfig = {
  output: 'standalone', // small Docker image: node server.js
  reactStrictMode: true,
  poweredByHeader: false,
  // Title, description and canonical always in <head> (streamed metadata ends up in <body> for bots Next doesn't know)
  htmlLimitedBots: /.*/,
  images: { unoptimized: true }, // product photos are already WebP ≤1200px from the API; placeholders are SVG
  async rewrites() {
    // In production nginx sends /api, /img and the static pages elsewhere; these only help `next dev`.
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default config;
