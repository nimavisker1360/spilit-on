self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Keep the service worker intentionally minimal for installability
  // without introducing offline caching behavior yet.
  event.waitUntil(self.clients.claim());
});
