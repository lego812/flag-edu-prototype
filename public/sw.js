const CACHE_NAME = "flag-edu-shell-v3";
const PUBLIC_ASSETS = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  // Never precache personalized HTML or authenticated workspace data.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("flag-edu-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode === "navigate") {
    return;
  }

  const url = new URL(event.request.url);
  // RSC, API, Auth, photos and cross-origin resources keep their native fetch
  // semantics. An absent cached Response must never break those requests.
  if (
    url.origin !== self.location.origin ||
    url.search !== "" ||
    event.request.headers.has("RSC") ||
    !PUBLIC_ASSETS.includes(url.pathname)
  ) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request)) ??
        new Response("Public asset unavailable while offline.", { status: 503 });
    }),
  );
});
