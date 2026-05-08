/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow requiring native deps at runtime on the server (no bundling)
    serverComponentsExternalPackages: [
      '@anush008/tokenizers',
  'onnxruntime-node',
  'fastembed',
  '@qdrant/js-client-rest',
    ],
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  async headers() {
    return [
      // Ensure Next static assets are cached immutably by browsers/CDNs
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Prevent HTML documents from being cached by proxies/CDNs to avoid stale build HTML
      {
        source: '/:path*',
        has: [
          { type: 'header', key: 'accept', value: '.*text/html.*' },
        ],
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // Base
              "default-src 'self'",
              // Scripts: allow Clerk and Skypack, plus inline/eval for Next/Clerk bootstraps
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://cdn.skypack.dev",
              // Align script-src-elem with script-src so external script tags from Clerk load
              "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' blob: https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://cdn.skypack.dev",
              // Styles and style elements
              "style-src 'self' 'unsafe-inline' https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://fonts.googleapis.com",
              "style-src-elem 'self' 'unsafe-inline' https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://fonts.googleapis.com",
              // Other resources
              "img-src 'self' data: blob: https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://img.clerk.com",
              "font-src 'self' data: https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://fonts.gstatic.com",
              "connect-src 'self' https://api.groq.com https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev https://cdn.clerk.com https://cdn.skypack.dev https://clerk-telemetry.com ws: wss:",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              "frame-src 'self' https://clerk.com https://*.clerk.com https://*.clerk.services https://*.clerk.dev https://*.accounts.dev",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              // Auto-upgrade any http resources like http://fonts.googleapis.com to https
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
