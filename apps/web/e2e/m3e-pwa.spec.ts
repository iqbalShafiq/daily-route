import { expect, test, type Page } from "@playwright/test";

/**
 * The M3E, PWA and personal surfaces, with a stub for every API call.
 *
 * No request reaches the real API, a model provider or X. The fixtures
 * below are the shape the client reads; the browser still runs the real
 * planner state machine, the real theme provider, the real planner record
 * helpers and the real map.
 */

const NOW = new Date("2026-11-27T03:00:00.000Z");

const P = (latitude: number, longitude: number) => ({ latitude, longitude });

function rideLeg(overrides: {
  lineId: string;
  lineCode: string;
  lineName: string;
  mode: string;
  serviceClass: string;
  fromName: string;
  toName: string;
  durationMinutes: number;
  distanceKm: number;
  stops: { stationId: string; name: string; latitude: number; longitude: number }[];
  waitMinutes?: number;
}) {
  return {
    kind: "ride" as const,
    mode: overrides.mode,
    lineId: overrides.lineId,
    lineName: overrides.lineName,
    lineCode: overrides.lineCode,
    serviceClass: overrides.serviceClass,
    fromStationId: overrides.stops[0]?.stationId ?? null,
    toStationId: overrides.stops[overrides.stops.length - 1]?.stationId ?? null,
    fromName: overrides.fromName,
    toName: overrides.toName,
    durationMinutes: overrides.durationMinutes,
    distanceKm: overrides.distanceKm,
    stops: overrides.stops,
    walkReason: null,
    nextLineName: null,
    waitMinutes: overrides.waitMinutes ?? 3,
    changedFrom: null,
    changedAt: null,
    geometry: overrides.stops.map((stop) => P(stop.latitude, stop.longitude)),
    serviceLabel: "05:00-22:00",
    headwayMinMinutes: 5,
    headwayMaxMinutes: 9,
    direction: "forward" as const,
    directionLabel: `${overrides.fromName} ke ${overrides.toName}`,
    fromPlatform: null,
    toPlatform: null,
    detour: null,
  };
}

const HI = {
  stationId: "stub-bundaran-hi",
  name: "Bundaran HI",
  latitude: -6.195,
  longitude: 106.823,
};
const MONAS = {
  stationId: "stub-monas",
  name: "Monumen Nasional",
  latitude: -6.176,
  longitude: 106.827,
};
const HARMONI = {
  stationId: "stub-harmoni",
  name: "Harmoni",
  latitude: -6.166,
  longitude: 106.82,
};
const KOTA = {
  stationId: "stub-kota",
  name: "Kota",
  latitude: -6.137,
  longitude: 106.814,
};

const FARE = {
  available: true,
  totalIdr: 3500,
  label: "Rp3.500",
  breakdown: [{ label: "Transjakarta", amountIdr: 3500 }],
  alternatives: [],
  notes: [],
};

function itinerary(overrides: {
  id: string;
  durationMinutes: number;
  fareIdr: number;
  transferCount: number;
  walkingKm: number;
  primaryCode: string;
  primaryLineId: string;
  primaryName: string;
  mode: string;
  serviceClass: string;
}) {
  const leg = rideLeg({
    lineId: overrides.primaryLineId,
    lineCode: overrides.primaryCode,
    lineName: overrides.primaryName,
    mode: overrides.mode,
    serviceClass: overrides.serviceClass,
    fromName: "Bundaran HI",
    toName: "Kota",
    durationMinutes: overrides.durationMinutes,
    distanceKm: 4.2,
    stops: [HI, MONAS, HARMONI, KOTA],
  });
  return {
    id: overrides.id,
    durationMinutes: overrides.durationMinutes,
    transferCount: overrides.transferCount,
    distanceKm: 4.2,
    walkingKm: overrides.walkingKm,
    cost: overrides.durationMinutes,
    lines: [overrides.primaryCode],
    fare: {
      ...FARE,
      totalIdr: overrides.fareIdr,
      label: `Rp${overrides.fareIdr.toLocaleString("id-ID")}`,
    },
    legs: [
      {
        ...leg,
        kind: "walk" as const,
        mode: "walk",
        lineId: null,
        lineName: null,
        lineCode: null,
        serviceClass: null,
        fromStationId: null,
        toStationId: HI.stationId,
        fromName: "Lokasi awal",
        toName: "Bundaran HI",
        durationMinutes: 5,
        distanceKm: overrides.walkingKm,
        walkReason: "access" as const,
        stops: [HI],
        geometry: [P(-6.2, 106.82), P(HI.latitude, HI.longitude)],
        serviceLabel: null,
        headwayMinMinutes: null,
        headwayMaxMinutes: null,
        direction: null,
        directionLabel: null,
      },
      leg,
    ],
    geometry: [P(HI.latitude, HI.longitude), P(KOTA.latitude, KOTA.longitude)],
  };
}

const NOTICE = {
  id: "stub-notice-harmoni",
  title: "Halte Harmoni ditutup sementara",
  body: "Perbaikan jalur pejalan kaki menutup halte Harmoni sampai Jumat.",
  severity: "severe",
  kind: "closure",
  mark: "closure",
  status: "active",
  systemId: "transjakarta",
  source: "operator",
  sourceType: "post",
  url: "https://example.test/notice/harmoni",
  lineId: "transjakarta:1",
  stationId: "stub-harmoni",
  affectedStationIds: ["stub-harmoni"],
  affectedLineIds: ["transjakarta:1"],
  publishedAt: "2026-11-26T03:00:00.000Z",
  observedAt: "2026-11-26T03:05:00.000Z",
  startsAt: "2026-11-26T00:00:00.000Z",
  endsAt: null,
  eventKey: "stub-harmoni-closure",
  lastSeenAt: "2026-11-27T01:00:00.000Z",
  reviewAt: "2026-11-27T09:00:00.000Z",
  reviewState: "verified",
  lastVerifiedAt: "2026-11-27T01:00:00.000Z",
  validityWindows: [],
  activeNow: true,
  impact: "direct",
  demonstration: false,
  blocksService: true,
  viaToll: false,
  diversionDescription: null,
  diversions: [],
  scope: "stop",
  stations: [
    {
      id: "stub-harmoni",
      name: "Harmoni",
      systemId: "transjakarta",
      latitude: HARMONI.latitude,
      longitude: HARMONI.longitude,
    },
  ],
  lines: [
    {
      id: "transjakarta:1",
      code: "1",
      name: "Koridor 1",
      systemId: "transjakarta",
    },
  ],
  lineCodes: ["1"],
  roads: [],
  latitude: HARMONI.latitude,
  longitude: HARMONI.longitude,
  stationName: "Harmoni",
};

const LINE_ROWS = [
  {
    id: "transjakarta:1",
    systemId: "transjakarta",
    code: "1",
    name: "Koridor 1",
    mode: "bus",
    serviceClass: "brt",
    operator: "Transjakarta",
    status: "active",
    color: "#1E63D0",
    lengthKm: 12.4,
  },
  {
    id: "mrt-jakarta:n-s",
    systemId: "mrt-jakarta",
    code: "M",
    name: "Lebak Bulus ke Bundaran HI",
    mode: "metro",
    serviceClass: "rapid-transit",
    operator: "MRT Jakarta",
    status: "active",
    color: "#0B4A9E",
    lengthKm: 15.7,
  },
  {
    id: "krl:1",
    systemId: "krl",
    code: "1",
    name: "Jakarta Kota ke Bogor",
    mode: "rail",
    serviceClass: "commuter",
    operator: "KAI Commuter",
    status: "active",
    color: "#C4202E",
    lengthKm: 54.2,
  },
  {
    id: "transjakarta:9",
    systemId: "transjakarta",
    code: "9",
    name: "Pinang Ranti ke Pluit",
    mode: "bus",
    serviceClass: "brt",
    operator: "Transjakarta",
    status: "active",
    color: "#1E63D0",
    lengthKm: 28.1,
  },
];

const LINE_DETAIL = {
  ...LINE_ROWS[0],
  directions: [
    {
      direction: "forward",
      label: "Bundaran HI ke Kota",
      headsign: "Kota",
      stops: [HI, MONAS, HARMONI, KOTA].map((stop, index) => ({
        id: stop.stationId,
        name: stop.name,
        code: String(index + 1),
        isInterchange: index === 2,
        area: "Jakarta Pusat",
        latitude: stop.latitude,
        longitude: stop.longitude,
        platform: null,
      })),
    },
    {
      direction: "backward",
      label: "Kota ke Bundaran HI",
      headsign: "Bundaran HI",
      stops: [KOTA, HARMONI, MONAS, HI].map((stop, index) => ({
        id: stop.stationId,
        name: stop.name,
        code: String(index + 1),
        isInterchange: index === 1,
        area: "Jakarta Pusat",
        latitude: stop.latitude,
        longitude: stop.longitude,
        platform: null,
      })),
    },
  ],
};

const STATION_DETAIL = {
  id: HI.stationId,
  name: HI.name,
  systemId: "transjakarta",
  code: "1-01",
  latitude: HI.latitude,
  longitude: HI.longitude,
  stationType: "busway",
  isInterchange: true,
  area: "Jakarta Pusat",
  description: "Halte di sisi barat Bundaran Hotel Indonesia.",
  aliases: ["HI"],
  lines: [
    {
      id: "transjakarta:1",
      code: "1",
      name: "Koridor 1",
      serviceClass: "brt",
      mode: "bus",
    },
  ],
  interchangeWith: [],
};

const DEPARTURES = {
  station: {
    id: HI.stationId,
    name: HI.name,
    latitude: HI.latitude,
    longitude: HI.longitude,
  },
  at: NOW.toISOString(),
  lines: [
    {
      lineId: "transjakarta:1",
      code: "1",
      name: "Koridor 1",
      mode: "bus",
      serviceClass: "brt",
      color: "#1E63D0",
      direction: "forward",
      headsign: "Kota",
      origin: "Bundaran HI",
      platform: "HI 1",
      serviceLabel: "05:00-22:00",
      detail: "Setiap 5 sampai 9 menit",
      headwayMinMinutes: 5,
      headwayMaxMinutes: 9,
      waitMinutes: 4,
      reliable: true,
      night: false,
    },
  ],
};

const NETWORK = {
  lines: [
    {
      id: "transjakarta:1",
      systemId: "transjakarta",
      tier: "primary" as const,
      coordinates: [106.823, -6.195, 106.827, -6.176, 106.82, -6.166, 106.814, -6.137],
    },
    {
      id: "mrt-jakarta:n-s",
      systemId: "mrt-jakarta",
      tier: "primary" as const,
      coordinates: [106.8, -6.24, 106.82, -6.2, 106.823, -6.195],
    },
    {
      id: "krl:1",
      systemId: "krl",
      tier: "primary" as const,
      coordinates: [106.814, -6.137, 106.83, -6.18, 106.84, -6.22],
    },
  ],
  places: [],
  platforms: [],
};

function planFor(origin: string, destination: string) {
  return {
    origin: {
      text: origin,
      stationId: HI.stationId,
      name: "Bundaran HI",
      systemId: "transjakarta",
      latitude: HI.latitude,
      longitude: HI.longitude,
      score: 1,
    },
    destination: {
      text: destination,
      stationId: KOTA.stationId,
      name: "Kota",
      systemId: "transjakarta",
      latitude: KOTA.latitude,
      longitude: KOTA.longitude,
      score: 1,
    },
    itineraries: [
      itinerary({
        id: "fastest",
        durationMinutes: 28,
        fareIdr: 3500,
        transferCount: 0,
        walkingKm: 0.4,
        primaryCode: "1",
        primaryLineId: "transjakarta:1",
        primaryName: "Koridor 1",
        mode: "bus",
        serviceClass: "brt",
      }),
      itinerary({
        id: "cheapest",
        durationMinutes: 46,
        fareIdr: 3000,
        transferCount: 1,
        walkingKm: 0.7,
        primaryCode: "9",
        primaryLineId: "transjakarta:9",
        primaryName: "Koridor 9",
        mode: "bus",
        serviceClass: "brt",
      }),
      itinerary({
        id: "fewest-transfers",
        durationMinutes: 40,
        fareIdr: 5000,
        transferCount: 0,
        walkingKm: 0.2,
        primaryCode: "1",
        primaryLineId: "krl:1",
        primaryName: "KRL Lin Bogor",
        mode: "rail",
        serviceClass: "commuter",
      }),
    ],
    alternatives: [],
    disruptions: [],
    watch: [],
    routeBlocked: false,
    computedAt: NOW.toISOString(),
    quotedAt: NOW.toISOString(),
    scheduled: false,
    nightSafe: false,
  };
}

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

/**
 * Every API endpoint the page can call.
 *
 * The handler answers by path, so a test only has to describe the state it
 * wants and not the order the components fetch it in.
 */
async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/health") {
      await route.fulfill(json({ status: "ok", agent: true, model: "stub-model" }));
      return;
    }
    if (path === "/api/agent/tools") {
      await route.fulfill(
        json({ configured: true, model: "stub-model", provider: "stub" }),
      );
      return;
    }
    if (path === "/api/network/overview" || path === "/api/network") {
      await route.fulfill(json(NETWORK));
      return;
    }
    if (path === "/api/systems") {
      await route.fulfill(json([]));
      return;
    }
    if (path === "/api/lines") {
      await route.fulfill(json(LINE_ROWS));
      return;
    }
    if (path.startsWith("/api/lines/")) {
      await route.fulfill(json(LINE_DETAIL));
      return;
    }
    if (path.startsWith("/api/stations/") && path.endsWith("/departures")) {
      await route.fulfill(json(DEPARTURES));
      return;
    }
    if (path.startsWith("/api/stations/")) {
      await route.fulfill(json(STATION_DETAIL));
      return;
    }
    if (path === "/api/places/reverse") {
      await route.fulfill(
        json({
          place: {
            kind: "place",
            id: "stub-current",
            name: "Bundaran HI",
            address: "Jl. M.H. Thamrin, Jakarta Pusat",
            latitude: HI.latitude,
            longitude: HI.longitude,
            systemId: null,
            systemName: null,
          },
        }),
      );
      return;
    }
    if (path === "/api/places") {
      await route.fulfill(
        json([
          {
            kind: "station",
            id: HI.stationId,
            name: HI.name,
            systemId: "transjakarta",
            systemName: "Transjakarta",
            code: "1-01",
            latitude: HI.latitude,
            longitude: HI.longitude,
            isInterchange: true,
            lineCount: 3,
            street: "Jalan M.H. Thamrin",
          },
          {
            kind: "station",
            id: KOTA.stationId,
            name: KOTA.name,
            systemId: "transjakarta",
            systemName: "Transjakarta",
            code: "1-20",
            latitude: KOTA.latitude,
            longitude: KOTA.longitude,
            isInterchange: true,
            lineCount: 5,
            street: "Jalan Pintu Besar Utara",
          },
        ]),
      );
      return;
    }
    if (path === "/api/routes/plan") {
      await route.fulfill(
        json(
          planFor(
            url.searchParams.get("origin") ?? "Bundaran HI",
            url.searchParams.get("destination") ?? "Kota",
          ),
        ),
      );
      return;
    }
    if (path === "/api/routes/disruptions") {
      await route.fulfill(json([NOTICE]));
      return;
    }
    if (path.endsWith("/sources")) {
      await route.fulfill(json({ id: NOTICE.id, title: NOTICE.title, sources: [] }));
      return;
    }
    if (path === "/api/jpo") {
      await route.fulfill(json({ jpos: [] }));
      return;
    }
    if (path === "/api/walk/plan") {
      await route.fulfill(
        json({
          stationId: HI.stationId,
          stationName: HI.name,
          totalMinutes: 30,
          transferCount: 0,
          distanceKm: 4,
          walkingKm: 0.3,
          accessWalkKm: 0.3,
          walk: null,
        }),
      );
      return;
    }
    if (path === "/api/walk") {
      await route.fulfill(
        json({
          stationId: HI.stationId,
          stationName: HI.name,
          stationLatitude: HI.latitude,
          stationLongitude: HI.longitude,
          straightDistanceKm: 0.3,
          distanceKm: 0.4,
          durationMinutes: 6,
          steps: [],
          geometry: [P(-6.2, 106.82), P(HI.latitude, HI.longitude)],
        }),
      );
      return;
    }
    if (path === "/api/agent/chat") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: [
          'data: {"event":"status","text":"Membaca pertanyaan"}',
          'data: {"event":"delta","text":"Rute Bundaran HI ke Kota lewat Koridor 1 masih terbuka. "}',
          'data: {"event":"delta","text":"Perjalanan sekitar 28 menit."}',
          'data: {"event":"done"}',
          "",
        ].join("\n\n"),
      });
      return;
    }
    if (path === "/api/account") {
      if (method === "POST" || method === "DELETE") {
        await route.fulfill(json({ error: "Not available in this test." }, 401));
        return;
      }
      await route.fulfill(json({ error: "Not signed in." }, 401));
      return;
    }
    if (path === "/api/account/session") {
      await route.fulfill(json({ error: "Not available in this test." }, 401));
      return;
    }
    if (path === "/api/account/places" || path.startsWith("/api/account/places/")) {
      await route.fulfill(json({ places: [] }));
      return;
    }
    if (path === "/api/account/alerts") {
      await route.fulfill(json({ alerts: [] }));
      return;
    }
    if (path === "/api/account/memory") {
      await route.fulfill(json({ items: [] }));
      return;
    }
    await route.fulfill(json({ error: `No stub for ${path}` }, 404));
  });
}

function field(page: Page, name: "Dari" | "Ke") {
  return page.getByRole("combobox", { name, exact: true });
}

async function openTab(page: Page, label: string): Promise<void> {
  const nav = page.locator('nav[aria-label="Navigasi utama"]');
  await nav.locator("button:visible", { hasText: label }).first().click();
}

async function openSaya(page: Page): Promise<void> {
  await openTab(page, "Saya");
  await expect(page.getByRole("heading", { name: "Saya" })).toBeVisible();
}

test.describe("M3E personal, PWA and onboarding", () => {
  test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test("the map opens, the mode filter works and nothing overflows", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /Mau ke mana hari ini/ })).toBeVisible();

    const modes = page.getByRole("group", { name: "Saring moda di peta" });
    const krl = modes.getByRole("button", { name: "KRL" });
    await krl.click();
    await expect(krl).toHaveAttribute("aria-pressed", "true");
    await modes.getByRole("button", { name: "Semua" }).click();
    await expect(modes.getByRole("button", { name: "Semua" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test("plans, opens a route, rides it and records the finished trip", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /Mau ke mana hari ini/ }).click();
    await expect(page.getByRole("heading", { name: "Cari tujuan" })).toBeVisible();

    await field(page, "Dari").fill("Bundaran HI");
    await field(page, "Ke").fill("Kota");
    await page.getByRole("button", { name: "Cari rute" }).click();

    await expect(page.getByRole("heading", { name: "Pilihan rute" })).toBeVisible({
      timeout: 20_000,
    });

    const fastest = page.getByRole("radio", { name: "Tercepat" });
    await fastest.click();
    await expect(fastest).toHaveAttribute("aria-checked", "true");
    const cheapest = page.getByRole("radio", { name: "Termurah" });
    await cheapest.click();
    await expect(cheapest).toHaveAttribute("aria-checked", "true");
    const fewest = page.getByRole("radio", { name: "Sedikit transit" });
    await fewest.click();
    await expect(fewest).toHaveAttribute("aria-checked", "true");

    await page.locator("ol.m3-route-list button").first().click();
    await expect(page.getByRole("heading", { name: "Detail rute" })).toBeVisible();

    // The detail owns the window, so the bottom navigation bar is gone and
    // the floating toolbar is the only control on the lower edge.
    await expect(page.locator(".m3-nav")).toBeHidden();
    await expect(page.locator(".m3-toolbar").first()).toBeVisible();

    await page.getByRole("button", { name: "Mulai", exact: true }).click();
    await expect(page.getByRole("region", { name: "Perjalanan live" })).toBeVisible();

    await page.getByRole("button", { name: /berikutnya/ }).first().click();

    const wake = page.getByRole("switch", {
      name: "Bangunkan saya satu perhentian sebelum turun",
    });
    await wake.click();
    /*
     * A headless browser has no notification permission, so the alarm is
     * honest: it stays off and names the cause. With permission it would
     * read "true"; the screen must never claim an alarm it cannot ring.
     */
    await expect(
      page.getByText(/izinkan notifikasi|Pengingat turun aktif/).first(),
    ).toBeVisible();

    // The snackbar sits above the action bar. The button is reached with a
    // dispatched click so the assertion is about the journey ending, not
    // about the snackbar's own motion.
    await page
      .getByRole("button", { name: "Sampai", exact: true })
      .dispatchEvent("click");
    await expect(page.getByRole("heading", { name: /^Sampai di / })).toBeVisible();
    await page.getByRole("button", { name: "Selesai", exact: true }).click();

    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem("daily-route.completed-trips");
      return raw === null ? [] : (JSON.parse(raw) as unknown[]);
    });
    expect(saved.length).toBeGreaterThan(0);
  });

  test("opens a line, a station and the honest schedule note", async ({ page }) => {
    await page.goto("/?tab=lines");

    await expect(page.getByRole("heading", { name: "Status jalur" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /^1 Koridor 1/ }).first().click();

    await expect(page.getByRole("heading", { name: "Koridor 1" })).toBeVisible();
    await page.locator('ol[aria-label="Perhentian 1"] button').first().click();

    await expect(page.getByRole("heading", { name: "Bundaran HI" })).toBeVisible();
    await expect(page.getByText("Berdasarkan jadwal, bukan kedatangan live")).toBeVisible();
  });

  test("asks the assistant and walks into the inbox and an alternative route", async ({
    page,
  }) => {
    await page.goto("/?tab=chat");

    await expect(page.getByRole("heading", { name: "Tanya Daily" })).toBeVisible();
    await page.getByLabel("Pesan untuk Tanya Daily").fill("Rute ke Kota masih terbuka?");
    await page.getByRole("button", { name: "Kirim pesan" }).click();

    await expect(
      page.getByText(/Rute Bundaran HI ke Kota lewat Koridor 1 masih terbuka/),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/?tab=alerts");
    await expect(page.getByRole("heading", { name: "Kotak masuk" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /Halte Harmoni ditutup sementara/ }).first().click();

    await expect(
      page.getByRole("heading", { name: /Halte Harmoni ditutup sementara/ }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: /Rute alternatif/ }).first().click();
    await expect(page.getByRole("heading", { name: "Rute alternatif" })).toBeVisible();
  });

  test("Saya reads the trip, saves a routine, simulates a tap and changes the theme", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const trip = {
        originName: "Bundaran HI",
        destinationName: "Kota",
        durationMinutes: 28,
        fareIdr: 3500,
        walkKm: 0.4,
        crowdRating: "lumayan",
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem("daily-route.completed-trips", JSON.stringify([trip]));
    });
    await page.goto("/");
    await openSaya(page);

    await expect(page.getByText("Rekap bulan ini")).toBeVisible();
    await expect(page.getByText("1 perjalanan")).toBeVisible();
    await expect(page.getByText("0,4 km")).toBeVisible();

    await page.getByRole("button", { name: /Rutinitas/ }).first().click();
    await expect(page.getByRole("heading", { name: "Rutinitas" })).toBeVisible();
    await page.getByRole("button", { name: /Buat rutinitas|Tambah/ }).first().click();

    await field(page, "Dari").fill("Bundaran HI");
    await field(page, "Ke").fill("Kota");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText(/Bundaran HI ke Kota/).first()).toBeVisible();
    await page.getByRole("button", { name: "Kembali ke Saya" }).click();

    await page.getByRole("button", { name: /Kartu/ }).first().click();
    await expect(page.getByRole("heading", { name: "Saldo kartu" })).toBeVisible();
    await page.getByRole("button", { name: "Simulasikan tap" }).click();
    await expect(page.getByText("Simulasi").first()).toBeVisible();
    await page.getByRole("button", { name: "Kembali ke Saya" }).click();

    await page.getByRole("button", { name: "Buka pengaturan" }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();

    await page.getByRole("radio", { name: "Gelap" }).click();
    await page.getByRole("button", { name: "Warna Coral" }).click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset["theme"]))
      .toBe("dark");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset["seed"]))
      .toBe("coral");
  });

  test("walks the onboarding from the splash to the map", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(page.getByText("Jalan tiap hari, tanpa drama.")).toBeVisible();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Tujuh moda. Satu peta." })).toBeVisible();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Tahu duluan, bukan ketahuan." }),
    ).toBeVisible();
    await expect(page.getByText("Contoh alur pantauan").first()).toBeVisible();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Hafal rutinitasmu, siap plan B." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mulai", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Halo, komuter." })).toBeVisible();
    await page.getByRole("button", { name: "Jelajahi tanpa akun" }).click();

    await expect(
      page.getByRole("heading", { name: "Ke mana kamu biasa pergi?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Biar agent bisa jagain kamu." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Masuk ke peta" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
