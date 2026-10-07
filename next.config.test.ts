import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("root route configuration", () => {
  it("keeps the development badge from intercepting the mobile Home menu", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });
  it("redirects the root URL to login before rendering a landing page", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");

    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({
      source: "/",
      destination: "/login",
      permanent: false,
    });
  });
});
