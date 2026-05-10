import type { NextConfig } from "next";

// Hide "X-Powered-By: Next.js" from responses — small but recommended hardening.
// Removes a fingerprinting vector and is flagged by some security scanners.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const longCache = {
  key: "Cache-Control",
  value: "public, max-age=31536000, immutable",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/media/**",
      },
    ],
  },
  async headers() {
    return [
      // Site-wide security headers
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Long-cache static assets shipped from /public
      {
        source: "/img/:path*",
        headers: [longCache],
      },
      {
        source: "/cursors/:path*",
        headers: [longCache],
      },
      // Robots/sitemap/manifest — short cache so updates propagate quickly
      {
        source: "/(robots.txt|sitemap.xml|manifest.webmanifest)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },
      // AI / human / security plain-text files at site root
      {
        source: "/(llms.txt|humans.txt)",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
      {
        source: "/.well-known/security.txt",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
