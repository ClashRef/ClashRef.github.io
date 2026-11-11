"use strict";
// Clash Ref service worker: network-first for this site's own files, so online
// visitors always get fresh data, with a saved copy used when offline or when the
// network is slower than SLOW_MS. Wiki images and analytics are not touched.
const VERSION = "clashref-v2";
const SLOW_MS = 3000;
const SHELL_KEY = "./";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Save the page plus the exact versioned CSS/JS it references.
    const page = await fetch(SHELL_KEY, {cache: "no-cache"});
    if (page.ok) {
      const html = await page.clone().text();
      await cache.put(SHELL_KEY, page);
      const assets = [...html.matchAll(/(?:href|src)="([^"#]+\.(?:css|js)(?:\?[^"]*)?)"/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u));
      await Promise.all([...assets, "data/categories.json"].map((u) => cache.add(u).catch(() => {})));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function save(res, key, url, navigate) {
  const cache = await caches.open(VERSION);
  // Drop older ?v= copies of the same file so the cache doesn't grow.
  if (!navigate) for (const old of await cache.keys()) {
    const o = new URL(old.url);
    if (o.pathname === url.pathname && o.search !== url.search) await cache.delete(old);
  }
  await cache.put(key, res);
}

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/sw.js")) return;
  const navigate = req.mode === "navigate";
  const key = navigate ? SHELL_KEY : req;
  let saving = null;
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") saving = save(res.clone(), key, url, navigate);
    return res;
  });
  event.waitUntil(network.then(() => saving, () => {}).catch(() => {}));
  event.respondWith((async () => {
    const cached = await caches.match(key, {ignoreSearch: navigate});
    if (!cached) return network;
    return Promise.race([
      network.then((res) => (res.ok ? res : cached), () => cached),
      new Promise((resolve) => setTimeout(() => resolve(cached), SLOW_MS)),
    ]);
  })());
});
