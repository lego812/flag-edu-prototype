import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bottom-left development badge overlaps mobile Home. This disables
  // only the badge; Next compile/runtime error reporting remains enabled.
  devIndicators: false,
  outputFileTracingIncludes: { "/api/exports": ["./assets/fonts/**/*"] },
  async headers() {
    return ["/invitations/:path*", "/auth/callback", "/signup/:path*"].map(
      (source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      }),
    );
  },
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
