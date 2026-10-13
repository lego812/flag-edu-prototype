// Only read-only overview/list routes may opt into full RSC prefetching.
// The Router Cache stays in browser memory; auth and server data remain uncached.
export function canPrefetchList(href: unknown): href is string {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return false;
  const url = new URL(href, "https://navigation.invalid");
  if (url.pathname === "/classes") {
    // A bare /classes depends on a view cookie. Only cache an explicit view URL.
    return ["list", "calendar"].includes(url.searchParams.get("view") ?? "");
  }
  return ["/dashboard", "/courses", "/reports", "/admin-reports"].includes(url.pathname);
}
