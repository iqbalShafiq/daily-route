# When a corridor borrows another corridor's road

26 October 2026. A DPR demonstration can close the inner-city toll road
and force Koridor 9 (Pinang Ranti–Pluit) onto an arterial path that belongs
to other corridors. The vehicle still runs as Koridor 9; the path and the
served stops are what change.

## Real cases

- **28–29 August 2025, DPR demo.** The operator's notice said: after
  Simpang Kuningan, follow **6A** to Monas/Bundaran HI ASTRA, then Tomang
  Raya and Tanjung Duren to Pluit. Denpasar through Kota Bambu were not
  served. Jasa Marga closed the Cawang–Tomang–Pluit toll.
  [Liputan6, 28 Aug 2025](https://www.liputan6.com/news/read/6144945/rute-transjakarta-koridor-9-dan-6-sebagian-dialihkan-imbas-demo-ricuh-di-dpr-berikut-pengaturannya),
  [Kompas, 29 Aug 2025](https://money.kompas.com/read/2025/08/29/170226426/imbas-demo-semua-rute-transjakarta-yang-lewat-dpr-kembali-dialihkan-ini)
- **22 August 2024, RUU Pilkada demo.** Pluit direction: Semanggi, then the
  Koridor 1 lane to Sarinah/Bank Indonesia, Kebon Sirih–Fachrudin–Jati
  Baru–Cideng Barat, Tarakan, Tomang, Tanjung Duren. The return used the
  same streets and rejoined at Semanggi/Widya Chandra.
  [CNN Indonesia, 22 Aug 2024](https://www.cnnindonesia.com/ekonomi/20240822183734-92-1136381/transjakarta-alihkan-rute-buntut-demo-revisi-uu-pilkada-ini-detailnya)
- **2 October 2019, labour demo.** Semanggi–Karet–HI–Monas–Harmoni–
  Tarakan–Tomang–Central Park. [Kompas, 2 Oct 2019](https://megapolitan.kompas.com/read/2019/10/02/11401301/imbas-demo-buruh-transjakarta-tambah-pengalihan-rute-bus)
- **Counter-case:** when the toll is open, Koridor 9 may use the toll and
  skip only Gerbang Pemuda/Petamburan, or skip JCC/Slipi Petamburan. The
  diversion is a decision, not a fixed property of a DPR demo.
  [Detik, 27 Aug 2026](https://news.detik.com/berita/d-8637261/transj-rute-koridor-9-dialihkan-imbas-penutupan-jalan-depan-gedung-dpr)

## What the standards say

- **GTFS Schedule** keeps `route_id = 9` and creates a trip with a new
  `shape_id`; `stop_times.txt` lists only the stops actually served. A
  shape can overlap 6A/1/8 without becoming those routes.
- **GTFS-Realtime TripModifications** is the standards-based replacement:
  `start_stop_selector`, `end_stop_selector`, replacement stops and a new
  full-trip shape. Alerts alone do not carry geometry.
- **Transit app** detects a detour when vehicles leave the shape, borrows
  stops from the route it follows, draws the unserved section dashed, and
  marks closed stops with an X.
  [Transit detour detection](https://blog.transitapp.com/transit-can-now-detect-where-your-bus-has-been-detoured/)
- Google Maps/Citymapper cannot plan an official diversion unless the
  operator publishes a replacement pattern (OTP PR #6028 discussion).

## What Daily Route now does

1. A notice can carry `metadata.diversions`: one temporary pattern per
   line/direction with `fromStationId`, `toStationId`, ordered `via`,
   borrowed geometry, `viaLineCodes`, skipped stops, and an `approximate`
   flag.
2. `withDiversions()` replaces only the span between the divergence and
   the rejoin, keeps the line id and fare, and rebuilds the geometry and
   stop offsets. The planner still sees **one line 9 trip**, not a chain
   of 6A/8 transfers.
3. `via` distinguishes a **served** stop from an **alignment** point. The
   2025 notice explicitly names Bundaran HI ASTRA, Tomang Raya and Tanjung
   Duren; the other 6A stops are alignment only, so the planner does not
   offer a boarding point the source did not promise.
4. The route list prints `Diverted via 6A/8`, the served via points, the
   approximate flag, and the skipped stops. The notice panel lists the
   served/alignment points and the quote/source.
5. The classifier now extracts the raw `diversion` description
   (`from`, `to`, `via`, `follows`) from a Post. It never invents geometry.
   A full pattern needs either a sourced shape or a reconstructed shape
   that is labelled approximate.

## Simulation

Fixture: `research/simulations/koridor9-dpr-diversion.json`. It contains
**both directions**. Each shape is composed from:

1. the OSM shape of **6A** from Kuningan to Bundaran HI (backward for the
   Pluit direction, forward for the return);
2. the OSM shape of **8** from Tomang Raya to Tanjung Duren (forward for
   the Pluit direction, backward for the return);
3. short connector roads routed with Valhalla's bus profile between
   Simpang Kuningan/Kuningan and Bundaran HI/Tomang.

The operator publishes no shape, so both patterns are marked
**approximate**, but every vertex comes from an OSM-derived corridor shape
or an OSM road route; no straight line is used between named places. The
fixture marks Denpasar–Kota Bambu as skipped.

With the fixture active, plan **Simpang Kuningan → Tanjung Duren**:

- fastest: 55 min, 2 changes, via 13E/6M/3F;
- **fewest changes: 59 min, 0 changes, Koridor 9 detour**, fare Rp3.500;
- reverse **Tanjung Duren → Simpang Kuningan**: 53 min, 0 changes,
  Koridor 9, fare Rp3.500.

The line 9 ride is drawn from Simpang Kuningan through the 6A alignment to
Bundaran HI ASTRA, Tomang Raya and Tanjung Duren. The reverse pattern uses
the same roads in the opposite order.

Screenshots: `research/screenshots/17-diversion-route.png`,
`18-diversion-notice.png`, and `19-diversion-reverse.png`.

## Limits

- The automatic classifier still only reads names. Building geometry for
  an arbitrary notice needs a road router or an operator-published shape;
  this fixture's geometry is reconstructed and labelled. Do not present a
  reconstructed path as official.
- A temporary pattern must be invalidated when the notice is resolved; it
  lives in the notice metadata and `NetworkCache` reloads after a change.
- The 2025 reverse direction is not published. The reverse pattern here is
  a reverse composition of the same roads, marked approximate; it is not
  an operator-published shape.
- `composeDiversionGeometry()` is the reusable corridor/road composer, but
  the monitor still needs a grounded waypoint set before it can build a
  pattern from an arbitrary Post.
