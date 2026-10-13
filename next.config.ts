import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bottom-left development badge overlaps mobile Home. This disables
  // only the badge; Next compile/runtime error reporting remains enabled.
  devIndicators: false,
  // Full, intent-prefetched list payloads live briefly in the browser Router
  // Cache. Ordinary dynamic pages (including editors) remain uncached.
  experimental: { staleTimes: { dynamic: 0, static: 30 } },
  outputFileTracingIncludes: { "/api/exports": ["./assets/fonts/**/*"] },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
