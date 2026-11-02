# Same corridor, different path

27 October 2026. A route code is not one stop list. The current snapshot
models one stop sequence and one shape per direction, so a branch, a
short-turn, an express run or a toll run collapses into the ordinary route.
That is wrong for Koridor 8 and Koridor 9, and the UI has no way to tell a
rider which stops a particular bus will actually serve.

## What the current GTFS says

The local feed is `data/gtfs`. It has 14 trips under `route_id=8` and 10
under `route_id=9`; several are loop or short-turn trips. The meaningful
passenger patterns are:

Cideng is **Sunday-scheduled, not Sunday-only in practice**. The operator
replied on 1 Aug 2025 that the two patterns are Tomang and Cideng and that
Cideng is "situasional apabila terjadi kepadatan lalulintas" — used when
Tomang is congested. The GTFS mask is `HM` (Sunday), so the app labels it
Sunday-scheduled and adds "also situational"; it must not promise a weekday
departure.

### Koridor 8 — Lebak Bulus–Pasar Baru

| Pattern | Direction | Stops | Service | Difference |
|---|---|---:|---|---|
| via Tomang (main) | Lebak Bulus→Pasar Baru | 26 | Daily (`SH`) | Serves Grogol Reformasi, Tanjung Duren, Tomang Raya, Tarakan |
| via Tomang (main) | Pasar Baru→Lebak Bulus | 24 | Daily (`SH`) | Return; Pondok Pinang is northbound only |
| via Cideng | Lebak Bulus→Pasar Baru | 24 | Sunday (`HM`) | Serves Grogol, Roxy; skips Grogol Reformasi, Tanjung Duren, Tomang Raya, Tarakan |
| via Cideng | Pasar Baru→Lebak Bulus | 23 | Sunday (`HM`) | Return of the Cideng alignment |

`8A` is a **separate `route_id`**, a Sunday/CFD short service, not a
weekday alignment of 8. The official 8 map draws only the Tomang
alignment. GTFS.zone and Moovit show the Cideng headsign; Wikipedia
describes it more broadly, but the machine-readable feed says Sunday.

### Koridor 9 — Pinang Ranti–Pluit

The all-stop route has 26 stops. The eastern Pinang Ranti–Cawang segment
uses the Jagorawi toll road permanently; there is no fully non-toll
end-to-end 9 in the current feed. The western inner-ring toll runs are
additional patterns under the same `route_id=9`:

| Headsign | Direction | Stops skipped vs all-stop |
|---|---|---|
| Pluit via Tol Kemanggisan | toward Pluit | Gerbang Pemuda, Petamburan |
| Pluit via Tol Petamburan | toward Pluit | Kemanggisan, Kota Bambu, Tanjung Duren, Grogol Reformasi, Kali Grogol, Jembatan Besi, Jembatan Dua, Jembatan Tiga |
| Pinang Ranti via Tol Jembatan Tiga | toward Pinang Ranti | Kali Grogol, Grogol Reformasi, Tanjung Duren, Kota Bambu |

The asymmetry is real: two toll patterns toward Pluit, one toward Pinang
Ranti. `9A`, `9C` and `9N` are separate route ids (cross-corridor,
short-turn and weekend shuttle), not patterns of 9.

### Other corridors with the same problem

- **6A/6B**: separate codes; same southern trunk, different city-centre
  approach (Kuningan vs Semanggi).
- **7**: same code with normal, via Tol HEK and via Tol TMII patterns;
  the toll runs skip Kramat Jati/Cililitan/Cawang Cililitan.
- **4**: via Kayu Putih, via Bermis (Sunday), via Saharjo under one code.
- **13/L13E**: 13E is weekend, L13E is the weekday limited-stop express;
  L13E skips nine minor stops.
- **10H**: separate code, not a short-turn of 10.
- **12**: short-turn patterns to Penjaringan/Sunter Boulevard Barat;
  12B is a street-level feeder, not a BRT pattern.

## How GTFS models it

A `route_id` is the rider-facing service. A `trip_id` is one scheduled run.
The variant is the combination of:

1. `direction_id`;
2. ordered `stop_times.stop_id` sequence;
3. `shape_id` (the road path);
4. `trip_headsign` (the label on the bus);
5. `service_id` (daily/weekday/weekend/Sunday).

GTFS does not have a `pattern_id` field. Apps derive a **trip pattern** by
grouping trips on the stop sequence, usually with direction and shape as
tie-breakers. Shape IDs are arbitrary: one 9 toll trip uses shape `8owt`.
Never infer the route or variant from the shape-id string.

## Why the current app cannot answer this

The planner's graph is built from `lines` + `line_stops` + `line_geometry`,
one sequence per line and direction. Koridor 8 has only the Tomang stops;
Koridor 9 has only the all-stop stops. The agent can therefore say "9 goes
from Pinang Ranti to Pluit" but cannot say "this 9 via Tol Petamburan does
not stop at Kemanggisan" or "the Sunday 8 goes through Cideng".

## Recommended model

Do not create synthetic lines for every pattern: that breaks line identity,
fare and transfer semantics. Add a pattern dimension:

```text
line_patterns
  id
  line_id              -> lines.id
  code                 (8, 9, 8A, ...)
  headsign             ("Pasar Baru via Cideng")
  direction            forward | backward
  pattern_type         branch | short-turn | express | toll | loop
  stop_ids             ordered array
  shape_id / geometry
  service_days         SH | HK | HL | HM ...
  toll                 boolean
  is_default           boolean
  source, source_url, valid_from, valid_to
```

The base route remains the default pattern. A route leg carries
`patternId`, `headsign`, `skippedStopIds` and `via`. The planner builds a
pattern-aware graph; changing pattern is not a transfer and does not
change the fare. If the rider's origin or destination is skipped by a
pattern, the planner offers an all-stop pattern or the nearest served stop.

Agent tools:

- `find_line` returns the patterns, their headsigns, service days and
  differences;
- `list_line_patterns(lineId, direction?)`;
- `plan_journey` returns the chosen pattern and `skippedStops`;
- `get_station` lists which patterns serve the stop.

## UI recommendation: variant switcher, not a literal tree

The branch idea is right, but a tree is the wrong control. Variants are
peer alternatives, not nested folders. A tree:

- grows horizontally and breaks the 360 px left panel;
- makes the rider choose a hierarchy before seeing stops;
- hides the one question that matters: "does this bus stop where I need?"

Use a **variant chip + difference list** instead:

```text
9  Pinang Ranti–Pluit                 26 stops   [All stops ▾]
   [All stops] [Tol Kemanggisan] [Tol Petamburan]
   Skips: Kemanggisan · Kota Bambu · Tanjung Duren · ...
```

- The default pattern is selected.
- Only patterns that differ are shown.
- Selecting a pattern updates the stop list and the map shape.
- A compact **fork strip** may show the shared trunk and the two
  alternatives after the divergence, but it is a diagram, not navigation.
- On a route leg, print the variant in the badge: `9 · via Tol
  Petamburan`; if the rider's stop is skipped, show a danger line and an
  all-stop alternative.
- On the map, draw only the selected pattern; optionally draw the other
  pattern dashed when the switcher is open. Do not draw every branch at
  once.

This is less "tree" and more "which departure do you want?" — the mental
model a rider already uses at the halt.

## Rollout

1. **Knowledge**: import GTFS patterns, including service days and
   headsigns, into `line_patterns`; keep the base pattern as default.
2. **UI**: pattern switcher and difference list in the line leg; agent
   tools expose the same data.
3. **Planner**: pattern-aware edges and skipped-stop handling; route
   result names the pattern.
4. **Realtime**: a headsign/vehicle feed can later select the pattern for
   a specific arrival; the static pattern is still the fallback.

## Sources

- Official route list: <https://transjakarta.co.id/rute>
- Official BRT list: <https://transjakarta.co.id/layanan/brt>
- Official GTFS: <https://gtfs.transjakarta.co.id/files/file_gtfs.zip>
- Official 8 map: <https://smk.transjakarta.co.id/aset/berkas/rute/8-20250102.jpg>
- Official 9 map: <https://smk.transjakarta.co.id/aset/berkas/rute/9-20250312.jpg>
- GTFS.zone 8: <https://sites.gtfs.zone/transjakarta/8/>
- GTFS.zone 9: <https://sites.gtfs.zone/transjakarta/9/>
- Catenary 8: <https://catenarymaps.org/en/agency/Transjakarta/route/8>
- Catenary 9: <https://catenarymaps.org/en/agency/Transjakarta/route/9>
- GTFS Schedule reference: <https://gtfs.org/schedule/reference/>
- 8 Cideng history: <https://en.wikipedia.org/wiki/Transjakarta_Corridor_8>
- 9 history: <https://en.wikipedia.org/wiki/Transjakarta_Corridor_9>
- 9 toll diversion, 24 Sep 2025: <https://news.detik.com/berita/d-8128931/lalin-di-jakarta-macet-malam-ini-transj-koridor-9-dialihkan-masuk-tol>
- 9 regular + express, 15 Oct 2025: <https://www.liputan6.com/news/read/6184808/transjakarta-sesuaikan-layanan-koridor-9-buntut-kepadatan-truk-di-kawasan-pluit-begini-skenarionya>
- 9 toll works, 11 May 2026: <https://haijakarta.id/catat-rute-transjakarta-koridor-9-berubah-sementara-sampai-5-juni-2026/>
- 8 flood short-turn, 4 May 2026: <https://megapolitan.kompas.com/read/2026/05/04/18032441/banjir-di-jaksel-transjakarta-perpendek-rute-koridor-8-lebak-buluspasar>
- 7 toll patterns: <https://sites.gtfs.zone/transjakarta/7/>
- L13E express: <https://sites.gtfs.zone/transjakarta/l13e/>

## Implemented 26 October 2026

The first three phases are in the working tree:

- `line_patterns` (migration `0010_line_patterns.sql`) and
  `data/line-patterns.json` hold 32 GTFS-derived patterns for Koridor 8,
  9, 8A, 7, 4, 13, L13E and 6A/6B. The snapshot now has 8A as a separate
  Sunday/CFD line, not folded into 8.
- The seed and `db:sync` load the pattern file. The pattern's direction is
  aligned to the published `line_stops` order, not to GTFS's
  `direction_id`, because the two disagree for Koridor 8.
- `buildGraph` chooses one pattern per line and direction: a direct pattern
  that carries both journey ends, then a pattern that carries an end the
  default does not, then the default. A pattern whose service day is not
  the requested Jakarta day is excluded. This prevents a search from
  changing patterns mid-ride as if the rider stayed on the same bus.
- The route API returns `patternId`, `patternLabel`, `patternService` and
  the other `variants` with `stops`, `skipped`, `extra`, `serviceLabel`,
  `toll` and `activeNow`. The left panel renders a compact pattern list,
  not a tree. It marks "this journey" and says "not today" for a Sunday
  pattern on a Monday.
- The agent has `list_line_patterns`; `find_line` lists pattern summaries,
  and `plan_journey` carries `pola`, `polaId`, `layananPola` and
  `polaTersedia`. It also accepts `departAt` with a +07:00 offset so a
  question about Sunday uses the Sunday pattern.

### Simulations

Run against the real database and the real API/UI on 26 October 2026:

| Query | Result |
|---|---|
| 8 Lebak Bulus → Pasar Baru, direct, Monday | 1 h 53 min, pattern **Pasar Baru** (Tomang), 26 stops |
| 8 Lebak Bulus → Pasar Baru, direct, Sunday | 1 h 50 min, pattern **Pasar Baru via Cideng**, 24 stops |
| Grogol → Pasar Baru, Sunday | 26 min, 0 changes, **8 via Cideng**; Grogol and Roxy are the added stops |
| 9 Pinang Ranti → Pluit | fastest 1 h 35 min with 4 changes; fewest changes 1 h 55 min, 0 changes, **9 via Tol Petamburan**, 18 stops |
| Car-free-day (Sunday) from Jelambar to Juanda | 8 via Cideng 26 min; 8A Juanda 29 min, both Rp3.500, 0 changes |
| 8A, Monday | not offered (Sunday-only service) |
| 7 Kampung Melayu → Kampung Rambutan | 7 via Tol HEK, 64 min, 0 changes |
| 4 Pulo Gadung → Galunggung | 4 via Kayu Putih, 90 min; Bermis pattern only on Sunday |

The real assistant called `find_line`, `list_line_patterns`,
`list_line_stops` and `plan_journey`, and gave the correct skip/add lists
for 8. A separate Sunday question selected `8 via Cideng` for Jelambar →
Juanda; after 8A was imported, the same question chose the 8A Juanda
pattern (29 min) and listed its seven stops.

### Remaining limits

- 8A, 7, 4, 13, 13E, L13E and 6A/6B now have patterns. 4 is not fully
  exhaustive: some GTFS patterns use temporary halt spellings; the main,
  Kayu Putih, Bermis and Saharjo patterns are present.
- 8A is now a line in the snapshot and is Sunday-only. It is still a separate
  route, not folded into 8.
- 13E is a separate weekend/holiday route (Sat–Sun, 05:00–22:00); L13E is
  the weekday express. GTFS has no `calendar_dates`, so the app carries the
  17 national holidays for 2026 itself (SKB 3 Menteri Nos. 1497/2025,
  2/2025, 5/2025); 13E is activated on those dates and L13E is suppressed.
  The 8 `cuti bersama` dates are not treated as national holidays.
- Cideng's data source is the current GTFS plus the operator's 1 Aug 2025
  reply; the weekday "situational" use is not a timetable.
- The planner has no live vehicle/headsign feed. It selects by endpoint,
  service day and number of stops; the headsign printed on the bus remains
  the final check.
- The Cideng service day follows the current GTFS (Sunday only). Wikipedia
  and some rider sites disagree; verify in the field before treating the
  weekday claim as true.

### Real-model checks

The real chat model, through the API's SSE endpoint, called
`find_line`, `list_line_patterns`, `list_line_stops` and `plan_journey`:

- Asked to compare 8 Tomang and Cideng, it answered 26 stops for Tomang and
  24 for Cideng, named Grogol/Roxy as the added stops and Grogol Reformasi,
  Tanjung Duren, Tomang Raya and Tarakan as skipped, and said Cideng is
  Sunday only. This matches the GTFS data.
- Asked about 9 toll patterns, it named the two Pluit toll headsigns and
  the reverse Tol Jembatan Tiga run, with the correct skip lists.
- Asked about the car-free-day Sunday from Jelambar to Juanda, it chose the
  Sunday Cideng pattern, 26 minutes, one fare, no changes.
- Asked specifically about 8A after the import, it chose the 8A Juanda
  pattern, listed Jelambar → Tanjung Duren → Tomang Raya → Tarakan → Petojo →
  Pecenongan → Juanda, 29 minutes, and warned that the 8A Pasar Baru pattern
  is different.

## Direction geometry fix (9A and friends)

The same corridor can have two OSM route relations, one per direction.
The old merge checked the **first plain `stop` member** to decide which
relation was the outbound one. A relation often starts with a
`stop_entry_only` member, which that list drops; the next stop can be near
the wrong end, so both relations looked outbound. The return then fell back
to the outbound path reversed — a path on the wrong carriageway. That was
the 9A line the rider saw at Grogol.

The direction test now uses the **polyline endpoints**, and a curated
origin/destination without coordinates is resolved to the station of the
same name before the test. Re-running `data:ingest` changed eight
geometries: 1T (both), 5C, 7C, 7V, 9A, S11 and S12 (return). 9A backward
now uses the Grogol→Cililitan relation (99 points) instead of reversing
the Cililitan→Grogol path (103 points). The regression is covered by
`packages/ingest/src/merge.test.ts`.

The map still draws the stored OSM carriageway; it does not invent a
left-lane offset. A road with a single OSM relation is still mirrored for
the return, which is the honest fallback for a corridor OSM did not trace
twice.

## Is a second OSM relation feasible?

The 256 lines in the snapshot split like this:

| OSM relations on the line | Lines |
|---|---:|
| 2 | 148 |
| 1 | 11 |
| 0 | 95 |
| 4 or 14 | 2 |

- **148 lines** already have a second OSM relation. That is the good case: the
  merge can keep each direction's carriageway, and the direction test now
  does so.
- **11 lines** have only one OSM relation: 7R, 7T, 7U, 7W, JAK.09, JAK.86,
  JAK.10A, JAK.10B, JAK.120, BW4 and B41. For these, OSM does not currently
  contain the return relation. The return can only be mirrored, or sourced
  from GTFS, or added by a survey/edit in OSM.
- **95 lines** have no OSM route relation at all. They are GTFS-only
  (Mikrotrans, rumah susun, Transjabodetabek, some Royaltrans). A second OSM
  relation is not available for them; the reverse is a GTFS shape or a
  mirror.

So "add the second OSM relation" is feasible for the 148 lines that already
have one, and **not** feasible as a data import for the 11 + 95 lines. The
honest options for the latter are:

1. use the GTFS shape for the reverse direction, if the feed carries a
   distinct `shape_id` for that direction;
2. keep the mirror and mark it as an approximate alignment;
3. add/survey the missing OSM route relation, which is fieldwork and an OSM
   edit, not something the app can infer;
4. get an operator shape.

The map now draws every Transjakarta bus line and ride leg with the
left-hand-traffic offset, so the visual side is consistent even where only
one relation exists. That is a rendering rule, not a claim that a mirrored
GTFS/one-relation shape is the exact carriageway.
