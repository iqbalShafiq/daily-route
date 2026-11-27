/* eslint-env serviceworker */
/**
 * Daily's service worker.
 *
 * The shell is precached once, the API reads a small offline copy, and every
 * other same-origin asset is stale-while-revalidate. Streams and account
 * responses are never touched: they are either long-lived EventSource
 * connections or authenticated cookie traffic.
 *
 * There is no build step for this file. It is served from `public/` as it is.
 */

const SHELL_CACHE = "daily-pwa-shell-v1";
const DATA_CACHE = "daily-pwa-data-v1";
const ASSET_CACHE = "daily-pwa-assets-v1";

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/badge-72.png",
];

const NEVER_CACHE = ["/api/agent/chat", "/api/monitor/activity", "/api/account"];

const DATA_ENDPOINTS = [
  "/api/network/overview",
  "/api/lines",
  "/api/systems",
  "/api/jpo",
  "/api/routes/disruptions",
];

const STATIC_EXTENSIONS = [".js", ".css", ".woff2", ".woff", ".svg", ".png", ".webmanifest"];

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isExcluded(pathname) {
  if (pathname === "/sw.js") return true;
  return NEVER_CACHE.some((prefix) => matchesPrefix(pathname, prefix));
}

function isDataEndpoint(pathname) {
  return DATA_ENDPOINTS.some((prefix) => matchesPrefix(pathname, prefix));
}

function isStaticAsset(pathname) {
  if (pathname.startsWith("/assets/") || pathname.startsWith("/icons/")) return true;
  return STATIC_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // One missing optional asset must not leave the app without a shell.
          }
        }),
      );
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
              key.startsWith("daily-pwa-") &&
              key !== SHELL_CACHE &&
              key !== DATA_CACHE &&
              key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key).catch(() => undefined)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("text/html")) {
      try {
        await cache.put("/", response.clone());
      } catch {
        // A full quota or a redirected response must not hide the network answer.
      }
    }
    return response;
  } catch {
    const cached = await cache.match("/");
    if (cached) return cached;
    return new Response(
      '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Daily</title><body><p>Daily belum tersimpan untuk mode offline. Sambungkan internet, lalu muat ulang.</p></body></html>',
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
}

async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Storage pressure is not a reason to fail an online read.
      }
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        error: "offline",
        message: "Data ini belum tersimpan di perangkat.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A cache write failure must not break the network answer.
      }
    }
    return response;
  });

  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }

  return network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isExcluded(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isDataEndpoint(url.pathname)) {
    event.respondWith(networkFirstData(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;
  if (isStaticAsset(url.pathname)) event.respondWith(staleWhileRevalidate(event, request));
});

function sameOriginUrlOf(value) {
  const fallback = new URL("/", self.location.origin).href;
  if (typeof value !== "string" || value.trim() === "") return fallback;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function notificationPayloadOf(value) {
  const source = value && typeof value === "object" ? value : {};
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const body = typeof source.body === "string" ? source.body.trim() : "";
  const url = typeof source.url === "string" ? source.url.trim() : "";
  const tag = typeof source.tag === "string" ? source.tag.trim() : "";
  const icon = typeof source.icon === "string" ? source.icon.trim() : "";

  return {
    title: title || "Daily",
    body: body || "Ada pembaruan di jaringan.",
    url: sameOriginUrlOf(url),
    tag: tag || "daily-update",
    icon: icon || "/icons/icon-192.png",
  };
}

function notificationOptionsOf(payload) {
  return {
    body: payload.body,
    icon: payload.icon,
    badge: "/icons/badge-72.png",
    tag: payload.tag,
    data: { url: payload.url },
    vibrate: [140, 60, 140],
  };
}

function showDailyNotification(payload) {
  return self.registration.showNotification(payload.title, notificationOptionsOf(payload));
}

self.addEventListener("push", (event) => {
  let payload = notificationPayloadOf(null);

  if (event.data) {
    try {
      payload = notificationPayloadOf(event.data.json());
    } catch {
      let text = "";
      try {
        text = event.data.text();
      } catch {
        text = "";
      }
      payload = notificationPayloadOf({ body: text });
    }
  }

  event.waitUntil(showDailyNotification(payload).catch(() => undefined));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const target = sameOriginUrlOf(data && typeof data === "object" ? data.url : undefined);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (existing) {
        try {
          await existing.focus();
        } catch {
          // A window that cannot be focused is still a window that can receive
          // the navigation message.
        }
        existing.postMessage({ type: "DAILY_NAVIGATE", url: target });
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === "SHOW_NOTIFICATION") {
    const payload = notificationPayloadOf(data.payload);
    event.waitUntil(showDailyNotification(payload).catch(() => undefined));
  }
});
