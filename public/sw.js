const VERSION = "v1";
const STATIC_CACHE = `techhub-static-${VERSION}`;
const COMPETITION_CACHE = `techhub-public-competitions-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_CACHED_COMPETITIONS = 12;
const COMPETITION_PATH =
  /^\/competitions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
const STATIC_DESTINATIONS = new Set(["script", "style", "font", "image", "manifest"]);
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("techhub-") &&
              key !== STATIC_CACHE &&
              key !== COMPETITION_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (url.pathname.startsWith("/api/")) {
      event.respondWith(networkOnlyForWrite(request));
    }
    return;
  }

  if (isCacheExcluded(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, request, url));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(handleStatic(event, request));
  }
});

function isCacheExcluded(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/sw.js" ||
    pathname === "/offline.html"
  );
}

function isPublicCompetitionUrl(url) {
  return COMPETITION_PATH.test(url.pathname) && url.search === "";
}

async function networkOnlyForWrite(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: "กำลังออฟไลน์ กรุณาเชื่อมต่อก่อนบันทึกข้อมูล" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}

async function handleStatic(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (
        response.ok &&
        response.type === "basic" &&
        !response.headers.has("set-cookie")
      ) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(async () => cached ?? Response.error());

  if (cached) {
    event.waitUntil(network.then(() => undefined).catch(() => undefined));
    return cached;
  }

  return network;
}

async function handleNavigation(event, request, url) {
  try {
    const response = await fetch(request);
    if (isPublicCompetitionUrl(url)) {
      await cachePublicCompetition(request, response);
    }
    return response;
  } catch {
    if (isPublicCompetitionUrl(url)) {
      const cached = await readCachedCompetition(request);
      if (cached) return cached;
    }
    return (
      (await caches.match(OFFLINE_URL)) ??
      new Response("กำลังออฟไลน์", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function cachePublicCompetition(request, response) {
  if (!response.ok || response.type !== "basic") return;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return;

  const copy = response.clone();
  let html;
  try {
    html = await copy.text();
  } catch {
    return;
  }

  if (!html.includes('data-auth="false"')) return;

  const cache = await caches.open(COMPETITION_CACHE);
  const headers = new Headers(response.headers);
  headers.set("X-Offline-Cached-At", String(Date.now()));
  await cache.put(
    request,
    new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
  await pruneCompetitionCache(cache);
}

async function readCachedCompetition(request) {
  const cache = await caches.open(COMPETITION_CACHE);
  const response = await cache.match(request);
  if (!response) return null;

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Offline-Read-Only", "1");
  return new Response(await response.text(), { status: 200, headers });
}

async function pruneCompetitionCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHED_COMPETITIONS) return;

  const entries = await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      const cachedAt = Number(response?.headers.get("X-Offline-Cached-At") ?? 0);
      return { request, cachedAt };
    }),
  );
  entries.sort((a, b) => a.cachedAt - b.cachedAt);

  await Promise.all(
    entries
      .slice(0, entries.length - MAX_CACHED_COMPETITIONS)
      .map((entry) => cache.delete(entry.request)),
  );
}
