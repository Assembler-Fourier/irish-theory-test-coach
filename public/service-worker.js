const CACHE_VERSION = "ittc-pwa-2026-07-09-1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const CACHE_NAMES = new Set([SHELL_CACHE, DATA_CACHE, IMAGE_CACHE]);

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./trust.js",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/maskable-icon.svg",
];

const DATA_ASSETS = [
  "./data/questions.enriched.json",
  "./data/questions.json",
  "./data/study_report.json",
];

const COMMON_IMAGE_ASSETS = [
  "./data/assets/img/quiz-img/a_0P6qm.png",
  "./data/assets/img/quiz-img/a_1oKgq.png",
  "./data/assets/img/quiz-img/motorwayahead.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      cacheUrls(SHELL_CACHE, SHELL_ASSETS),
      cacheUrls(DATA_CACHE, DATA_ASSETS),
      cacheUrls(IMAGE_CACHE, COMMON_IMAGE_ASSETS),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => (CACHE_NAMES.has(name) ? null : caches.delete(name)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isQuestionData(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (isImageAsset(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

async function cacheUrls(cacheName, urls) {
  const cache = await caches.open(cacheName);
  const absoluteUrls = urls.map((url) => new URL(url, self.registration.scope).toString());
  await Promise.allSettled(
    absoluteUrls.map(async (url) => {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return await caches.match(request)
      || await caches.match(new URL("./index.html", self.registration.scope).toString())
      || await caches.match(new URL("./offline.html", self.registration.scope).toString());
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("No cached response available.");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await refresh;
  if (response) return response;
  return await caches.match(new URL("./offline.html", self.registration.scope).toString());
}

function isQuestionData(url) {
  return url.pathname.includes("/data/") && url.pathname.endsWith(".json");
}

function isImageAsset(url) {
  return url.pathname.includes("/data/assets/") && /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);
}
