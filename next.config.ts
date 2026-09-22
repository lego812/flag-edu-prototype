import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/exports": ["./assets/fonts/**/*"] },
};

export default nextConfig;
