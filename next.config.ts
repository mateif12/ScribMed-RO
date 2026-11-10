import type { NextConfig } from "next";

/**
 * Static security headers. The page Content-Security-Policy (with a per-request
 * nonce) is set in src/proxy.ts; API routes get a locked-down CSP here.
 */
const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Microphone only for this origin; everything else disabled.
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
  // HSTS is ignored by browsers over plain HTTP (local dev), effective behind HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["pg"],
  experimental: {
    // API routes are excluded from the proxy matcher; keep proxy body buffering minimal.
    proxyClientMaxBodySize: "1mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: commonHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
