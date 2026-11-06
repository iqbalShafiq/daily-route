# AGENTS.md

Guidance for coding agents working in this repository. It is the single
source of truth for how the code is organised and what the rules are. If
something here conflicts with a habit you have, the habit loses.

## What this project is

Daily Route answers one question for people in Greater Jakarta: **how do I
get from A to B right now, and is the way still open?** It covers
Transjakarta (BRT, Metrotrans, Royaltrans, Minitrans, Mikrotrans), MRT
Jakarta, LRT Jakarta, LRT Jabodebek and KRL Jabodetabek.

Two halves of the same data:

- a **deterministic** planner (A* over a station graph) that never guesses;
- an **agentic** assistant that reads the rider's question, calls the same
  planner through tools, checks the operators' announcements, and explains
  the answer.

The agent is never the source of truth about the network. The graph is.

## Commands

```bash
pnpm install                # install the workspace
pnpm infra:up               # start Postgres + pgvector on port 5433
pnpm db:migrate             # apply the Drizzle migrations
pnpm db:seed                # load data/transit-network.json
pnpm data:ingest            # rebuild the snapshot from OpenStreetMap + research
pnpm data:embed             # recompute the station embeddings
pnpm data:gtfs              # fill lines with no stops from the operator GTFS
pnpm data:enrich            # name the kelurahan/kecamatan/kota of every stop
pnpm data:places            # rebuild the Jabodetabek place extract from Overture
pnpm data:jpo               # rebuild the JPO and footbridge registry
pnpm db:places              # load the place extract into map_places
pnpm verify:notices         # verify notice windows from X, news, and pages
pnpm db:sync                # apply the snapshot without clearing the notices
pnpm backtest:notices       # replay stored announcements through the pipeline
pnpm eval:fetch             # fetch the rail corpus once, into research/eval
pnpm eval:notices           # judge the pipeline against the labelled cases
pnpm eval:current-place     # Anvia eval of the current-place assistant
pnpm dev                    # API (3011), worker (4012) and web (3010)
pnpm typecheck              # tsc --noEmit in every package
pnpm lint                   # eslint in every package
pnpm test                   # unit and integration tests
pnpm test:e2e               # Playwright, starts the API and the web app
pnpm trial:current-place    # real-model trial of the current-place feature
pnpm build                  # production builds
```

`pnpm dev` and every `pnpm db:*` script load the **root `.env`** through
`dotenv-cli`. There is exactly one `.env` in this repository. Never add a
second one inside a package.

## Repository layout

```
apps/
  api/      Express HTTP API: transit reads, route planning, agent chat (SSE)
  web/      React + TanStack + Tailwind v4 front end
  worker/   Background monitor: holds the X stream, writes disruptions
packages/
  config/   Shared tsconfig and ESLint configuration
  env/      The one place that validates the environment
  db/       Drizzle schema, queries, migrations, seed
  transit/  Pure domain: graph, A* planner, geo, fares, text normalisation
  semantic/ Embedding providers and the place resolver
  agent/    Anvia agent, tools, classifier, monitor, X and Tavily clients
  ingest/   OpenStreetMap extraction and the curated/OSM merge
data/       The committed network snapshot the seed loads
research/   The research reports and their structured extracts
```

A package may only depend on packages below it. `packages/transit` is pure
TypeScript with no framework and no database — keep it that way.

## Boundaries

- **Secrets stay on the server.** Provider keys, database URLs and the X
  bearer token never reach the browser. Nothing secret uses a `VITE_` prefix
  (there is no `VITE_` prefix in this project at all).
- **The browser never talks to a model provider.** It calls the application
  API, and the API calls the provider.
- **Dependencies are injected.** A function takes the database, the resolver
  or the model configuration as an argument. No module reads `process.env`
  at import time, and no module keeps a module-level singleton connection.
- **The graph is the truth.** The model may name a place; the resolver
  decides which station that name refers to; the planner decides the route.
  Never let the model produce a station id, a coordinate, a duration or a
  fare.
- The planner judges a journey on **time, distance and the number of
  changes together**, and the waiting time for a new vehicle is part of
  it. The search uses that cost. The list the rider sees is ordered by
  duration, then by the number of changes.
- A line on the map is a path, never a connection between two points. A
  ride takes its geometry from the stored OSM-derived line path, cut at the
  foot of the boarding and alighting stop so the line meets the platform
  and does not overshoot it; a ride with no stored path draws no line. A
  walk is asked of the pedestrian router; when the router has no answer,
  the walk draws no line. The list still shows the walk's time and distance.
  The walk is closed to the exact stop or place at both ends when the
  router snapped it by at most 120 m, so the dashed walk meets the ride; a
  larger snap keeps its gap. The API never falls back to a straight
  segment to stand in for a router that did not answer.
- A gate charges one fare for the whole stay in the paid area. Changing
  corridor or platform at the same station, without a walk, is still that
  fare. A reader on the vehicle charges every boarding. A station group
  is a place the rider can walk through, not a paid area.
- **No fallback that invents data.** When a provider is missing, the feature
  reports the missing cause and the rest of the application keeps working.
  A deterministic stand-in is acceptable only when it is *labelled* as such.
  Place lookup uses a remote embedding model when one is configured.
  Without one, the lexical and exact channels answer, and no hash vector
  is written in their place. The resolver reuses a query embedding for
  ten minutes, so moving between the two place fields does not pay for
  the same name twice. Live disruptions come from the monitor. A record
  whose id starts with `contoh:` is not injected.
- **No backwards compatibility.** The project is pre-release. Change the
  schema, change the seed, change the consumer in one commit. Do not add
  adapters, shims or migration code for a shape that never shipped.

## The data pipeline

`data/transit-network.json` is committed and is the input of the seed. It is
produced by `pnpm data:ingest`, which merges two sources:

- **OpenStreetMap** (ODbL) for coordinates, route relations, stop order and
  the **path every vehicle travels** (the way members of a route relation);
- **`research/data/*.json`** for the official line names, operators, service
  classes, stop lists, interchange notes and the **published fares**.

Rules for the merge, in priority order:

1. The curated report owns the **name and the order** of a line's stops.
2. OpenStreetMap owns the **coordinates** and contributes any stop the
   curated list is missing.
3. The OSM relation name wins for the **service class**, because it states
   the brand outright ("Minitrans 1M", "Metrotrans 5F").
4. A station of a line that is not open yet never becomes routable. The
   research notes mark those stations; `isPlanned()` reads the marker.
5. A station of a different system with a matching name, within 400 m, or
   with an alias the report gives as an interchange, within 1.2 km, is the
   same place. The stations of one hub are never spread over more than
   600 m, so a hub is always one place a rider can walk through.

The path of a line is stitched from the way members of its relation,
simplified to three metres, and stored per direction with the index of
every stop along it. The planner measures the distance between two stops
**along that path**, so the time it estimates is the time the vehicle
needs, and the line drawn on the map follows the road. Each direction
keeps the relation that travels that way, so a return that uses another
street is stored and drawn as that street. When OpenStreetMap only has
one relation, the return is that same road reversed. A line whose
official sheet runs one way is stored as that direction only. The return
is not mirrored into a service the operator does not run.

Three rules keep that path honest:

- The relation that traces a direction is the one whose path starts at
  the published origin, not the one that came first. The direction test
  uses polyline endpoints; a relation can list `stop_entry_only` before
  its plain stops, so the old first-stop test could mistake a return
  relation for the outbound one and mirror the wrong carriageway (9A at
  Grogol). A corridor has one relation per direction, and each direction
  keeps its own. One of them may leave out a stretch of the road.
- The stops of every relation of the corridor are kept, so a place is
  never lost because one relation forgot it. A stop that stands close
  to a stop of the chosen relation is that same place, and is not
  counted twice.
- The road is kept. A stop that stands off it does not replace the
  path with straight lines between the stops. One stop a few hundred
  metres off does not throw twenty-five kilometres of road away.
- A way that starts more than a kilometre from the path so far is not
  the next stretch of the road. The chain that is the route is kept;
  a short way listed at the wrong end of the relation is not allowed
  to pull a straight line across the city.

The street of a stop is found by where the stop stands, not by the
order of the members of the relation: a relation in the second version
of the public transport tagging lists every stop before every way. The
findings are in `research/osm-geometry.md`.

When you change the pipeline, re-run
`pnpm data:ingest && pnpm data:gtfs && pnpm data:enrich && pnpm db:sync`
(or `pnpm db:seed` on a fresh database) and then `pnpm data:embed`, and check
`data/transit-network.json` in the diff. `data:ingest` rebuilds the snapshot
and drops the GTFS additions, so `data:gtfs` must follow it; `data:enrich`
reads the stations that `data:gtfs` added. `db:sync` prunes a station, line
or group that the snapshot no longer contains; notices are untouched. A
shrinking station count is a red flag, not a cleanup.

The offsets place every stop on the path, but a path can stop short of the
last stops or loop back through the first ones; then most offsets collapse
to one point and the along-path distance stops growing. When half the stops
share one point, the distance follows the stop chain instead, while the road
stays the drawn path. `buildLineGeometry` and the GTFS loader both do this.

A line has two directions, and each is its own pattern: its own stop order and
its own path. A station is the stop area a rider searches for; `lineStop.platform`
is the side of the road the vehicle stops at in that direction, taken from the
OSM node the relation names. Opposite directions often use two platforms with
one station name, and a stop can exist in only one direction. A repeated name
is matched by its place along this direction's path, so the return gets the
other platform. The map draws the forward side at every zoom and offsets the
return from zoom 13.4, so the two sides of a road are distinct only when the
camera is close; a one-way line stays on the base layer. The platform id is
built from the station and the coordinate, so a shared bay is one platform and
the two sides of a road are two. The code is the operator's `platform_code` or
`stop_code` from GTFS, or `ref`/`local_ref` from OSM; `data:gtfs` fills a
missing code from a GTFS stop within 12 m, or within 30 m when the name also
matches. The direction label names both ends. The
research is in `research/network-directions.md`.

8A has no OSM relation. `pnpm data:gtfs` therefore also creates the separate
8A line (Jelambar–Juanda) from the GTFS shape `8A-R03_shp` when the line is
missing; it is not folded into Corridor 8. The committed 8A patterns then
attach to that line.

OpenStreetMap has no route relation for many Mikrotrans lines. The operator's
GTFS feed is the coordinate source for those lines: `pnpm data:gtfs` reads
`routes.txt`, `trips.txt`, `stop_times.txt`, `stops.txt` and `shapes.txt`,
matches the route code, and fills only lines that have no stop list. It does
not replace a curated line. A trip whose shape does not follow the stop order
is rejected rather than drawn as a straight line. The feed is
`https://gtfs.transjakarta.co.id/files/file_gtfs.zip` (see
`research/agent-verification.md` for the verification design, and the GTFS
feed for the official stop coordinates).

`pnpm data:places` builds `data/places-jabodetabek.parquet`, the places that
are not stops. It reads the latest Overture Maps Places release through the
STAC catalog, keeps the points inside the Jabodetabek box with confidence at
least 0.5 and an open status, drops a name that starts with punctuation, and
reduces the same name within about 110 m to the record with the highest
confidence. The release, count and box are written to
`data/places-jabodetabek.json`; the licences and the Foursquare notice are in
`data/PLACES-NOTICE.txt`. The extract is open data: CDLA Permissive 2.0, and
Apache 2.0 for the Foursquare records. `pnpm db:places` loads it into
`map_places` through DuckDB's Postgres extension. Both commands need the
DuckDB CLI (`brew install duckdb`); the first run installs the S3 and Postgres
extensions. `db:seed` does not load the places, so a fresh database needs
`pnpm db:places` once. `pnpm places:check` compares the snapshot with the
latest Overture release without DuckDB or a database, and `pnpm places:refresh`
runs both steps; Overture publishes monthly, so the check can run in a
scheduled job. The place field reads `map_places` first and asks a geocoder
only when the local list holds fewer than three answers.

`pnpm data:enrich` gives every station its administrative address. It reads
the boundary dumps in `data/admin` (MIT, geometry from BIG; fetch them with
`research/tools/geo/fetch-boundaries.sh`) and tests each point against the
kelurahan polygons. It writes `metadata.province`, `city`, `district`,
`village` and the code, and sets `area` to the kecamatan so station search
can use it. Run it **after** `data:gtfs`: the ingest rebuilds the snapshot and
the GTFS stops are added last. A point on a boundary sliver is assigned to the
nearest polygon within 300 m and marked `boundaryApproximate`. The measured
coverage and the known gaps are in `research/data-completeness.md`.

## Pedestrian bridges (JPO)

- `pnpm data:jpo` builds `data/jpo-network.json` from two sources: the
  official Dinas Bina Marga DKI Jakarta `JPO Bina Marga 2024` FeatureServer
  on Jakarta Satu (203 points, `PERIODE_DA` 2025), and OpenStreetMap
  footway/pedestrian bridges and tunnels in the Jabodetabek box. The
  official point gives the name, address, type and remark; OpenStreetMap
  gives the line. OpenStreetMap is ODbL 1.0, and the official layer is a
  city asset record. The notice is `data/JPO-NOTICE.txt`; the research is
  `research/jpo.md`.
- An official point matches the nearest OSM bridge line within 80 m. 192 of
  the 203 matched; the other 11 stay point-only and are never used to route
  a walk. A point-only record is drawn as a point, not as a line.
- An OSM bridge without an official point is kept only when it is named as
  a JPO, skywalk, penyeberangan or busway, or when an end is within 120 m
  of a transit stop. A park bridge is not transit access. A bridge end
  within 120 m of a stop links the two.
- The build produced 801 records: 203 official, 598 OSM-only, and 772
  linked to a stop. The official geometry is DKI Jakarta only; Bodetabek is
  OSM-only and is marked `official: false`. An underpass is not a JPO
  unless the source says so: the Kuningan pedestrian underpass is not in
  the official JPO layer, and the registry does not invent it.
- The transit package's `jpoWalkEstimate` is the only bridge rule for
  choosing an access stop. It accepts a bridge only when the place is
  nearer the entry than the far end and the stop is nearer the exit than
  the entry. The access walk is still the pedestrian router's path; the
  bridge only changes which stop is weighed.
- A routed walk that passes within 20 m of a **named official** bridge
  carries `jpo` on the walk leg, and the route board says "Via JPO ...".
  An unnamed OSM segment is not promoted to a named JPO.
- The map draws the named official bridge as a thin solid ochre line with a
  paper casing from zoom 12.5; its two end rings appear from zoom 14. An
  OSM-only bridge is a quiet dashed ink line from zoom 15. No bridge carries
  a label on the map: the pointer names it and the stops it serves. At city
  zoom the layer is hidden.
- The assistant's `find_jpo` tool returns only the registry records, with
  the source and the nearby stops, and says when there is no record. The
  prompt treats an underpass as not a JPO, and a bridge near a stop as not
  proof that the walk uses it.
- Run `pnpm data:jpo` after a network rebuild so the stop ids in the
  registry are current. `pnpm data:jpo -- --refresh` ignores both caches.
- The data is generated independently of `db:seed`; the API loads the
  committed file at process start and serves it at `GET /api/jpo`. A
  missing file reports the missing cause and the map draws no bridge line.

## Scheduled service

- `data:gtfs` reads `frequencies.txt` and `calendar.txt` and attaches
  `metadata.service` to each Transjakarta line. The metadata is per direction:
  the windows, the scheduled headway and a `reliable` flag. A single full-day
  row (at least four hours) with a plausible headway is trusted; a short
  single row is trusted only for a curated one-way route such as 7R
  (05:00–06:00, two Cibubur departures). 10H is the counter-example: its GTFS
  return row stops at 07:00 while the official service runs to 22:00, so the
  short row stays context and does not remove the direction. An implausible
  template row never removes a journey.
- `serviceAt(line, direction, at)` in `packages/transit/src/service.ts` is
  the one place that answers whether a line runs at an instant. The planner
  filters the graph with it, uses half the median headway as the wait, and
  carries `serviceLabel`, `headwayMinMinutes`, `headwayMaxMinutes` and the
  daily window on every ride leg. It is a schedule, never a live arrival.
- The night rule is silent. A departure between 22:00 and 05:00 WIB, taken
  from the instant the planner receives (`at`, or now when it is omitted),
  adds a walking penalty and orders the result by the night cost, so a shorter
  ride with a long dark walk does not automatically win. It follows the
  departure, not the moment the page was opened. The rider is never told that
  it is on: there is no switch, label or result sentence. An explicit
  `nightSafe` still wins. The line windows still decide what runs; the rule
  does not invent a service and does not promise personal safety.
- `/api/stations/:id/departures` returns the scheduled lines at a stop.
  The stop popover labels the list "Schedule-based, not live arrivals".
- `Line.metadata` is loaded from the database so the planner can read the
  service windows. If a future pipeline rebuild runs `data:ingest`, it must
  be followed by `data:gtfs` to restore them.

## The chat surface

- Chat cards are semantic values from tool results, not prose parsed with a
  regex. The union is `packages/transit/src/chat.ts`; the mapping is
  `apps/api/src/chat-cards.ts`; the UI is
  `apps/web/src/features/chat/chat-cards.tsx`.
- The SSE stream carries `card` next to `delta`, `tool`, `actions` and
  `done`. A card cannot contain a station id, fare or duration the tool did
  not return. The `done` event also carries the Langfuse trace handle when
  tracing is configured; the browser ignores it, and the current-place eval
  uses it to put its scores on the trace that produced the answer. The browser dedupes a stop card from `resolve_place` when the
  richer `get_station` card arrives.
- Actions are buttons on the card: open the journey, show a stop, set an
  endpoint, show a notice or open a source. They go through the same
  planner and map handlers as the rest of the interface.
- The assistant is asked for plain text; a small rich-text fallback renders
  bold labels and lists that a fallback model still emits. The planner data
  is never read from that text.
- `find_line` carries the `service` block for each direction, including
  `active` at the requested instant. A listed line is not necessarily
  running: the assistant must not suggest a line outside `plan_journey`
  without reading that block. 7R is the regression case: 05:00–06:00 only,
  Cibubur to Pluit.
- `Watch` is a local memory in `use-watch.ts` until the rider signs in.
  It keeps a journey across a reload and labels it on the result; it is
  not a push notification and does not claim one.

## The account

An account is optional. The planner, the map and the assistant work without
one. Signing in is how saved places, recent places, recent journeys and
watches follow the rider to another browser.

- Postgres holds `users`, `sessions` and `rider_memory_items`. The session
  cookie is `HttpOnly`; the table stores the SHA-256 of the token, never the
  token. A station id in a memory payload is not a foreign key: `db:seed`
  truncates the network with `CASCADE`, and a key would delete the rider's
  rows with it. The write looks the station up and overwrites the name and
  the coordinate from the graph.
- The browser keeps the theme in `localStorage` and the chat session id in
  `sessionStorage`. Those are device preferences and a pointer, not the
  account. While the rider is signed out, the four memory keys stay in
  `localStorage` as they did before. The first successful sign-in uploads
  them and then deletes the keys. Sign-out does not copy the account back
  onto the device.
- There is no mailer, so there is no email verification and no password
  reset. A missing address and a wrong password are the same answer. A
  mutation that carries the cookie is refused unless `Origin` is
  `WEB_ORIGIN`.

## Rider personalization

- A signed-in rider can name a place ("Home", "Office", any label of their
  own). `rider_places` stores the rider's spelling; `lower(label)` is the
  unique test, so the same label in another case replaces the row. A station
  place takes its name and coordinates from the stations table, and the cap
  of 16 distinct labels is enforced inside the write. The table has no
  station foreign key, for the same reason the memory items do not.
- A rider can mark where they are standing. The browser gives the position,
  `GET /api/places/reverse` turns it into a short name, a full address and the
  same coordinate, and the Places tab opens the add form with the address in
  the place field and "Current location" as the label. The rider renames the
  label and saves it through the same `POST /api/account/places` write. A
  reverse lookup that cannot answer falls back to a nearby stop; it never
  invents an address. The place payload carries `address` beside `name`, and
  the list shows the address.
- Every successful plan with a session records a `rider_observations` row:
  the origin and destination station keys and names, the primary itinerary's
  line codes, and the Jakarta weekday and minute. A repeat in the same
  15-minute bucket within two hours is a reload, not a second habit. A
  failed write never fails the plan.
- `habitsFrom` in `packages/transit/src/habits.ts` is the only habit rule:
  group by origin, destination and weekday; three observations in 28 days
  make a habit; the minute is the median and the window is ±45 minutes,
  which may cross midnight. Four habits are kept at most. A label is the
  latest non-null label the rider gave, never an invented one.
- `noticesForHabit` matches a stored notice only inside that weekday window.
  A network notice matches; a line or stop notice must share a corridor code
  or name an endpoint. An unknown scope does not match. This reads stored
  notices and never calls X or Tavily.
- `GET /api/account/places`, `POST /api/account/places` and
  `DELETE /api/account/places/:label` are on the account router, so the
  origin check applies. `GET /api/account/alerts` answers
  `{ alerts: [{ habit, notices }] }` from the observations and
  `listActiveDisruptions`.
- The chat's `list_my_places` and `list_my_habits` tools read the rider from
  `riderStore`, an `AsyncLocalStorage` the route fills per turn; the model
  never passes a user id. They return names, labels and the saved address,
  never a station id. `plan_journey` records a `chat` observation the same way
  the plan route records a `plan` one.
- The chat request may carry the marked current place. The route validates
  that the coordinate is inside Jabodetabek and fills `currentPlaceStore`, a
  second `AsyncLocalStorage`; the prompt tells the model the name and address
  and that `plan_journey` takes `originCurrent: true`. The tool reads the
  coordinate from the store, finds the stop whose whole journey is quickest,
  and reports the walk to that stop in `catatan`. The model never passes a
  coordinate and never chooses the stop.
- `tool_result_cache` is a public cache with no user column. The news key
  ignores word order, case and punctuation, keeps single-digit corridor
  numbers, and includes the time range, topic and sorted domain filters. The
  API and the worker share the same database-backed store, with the
  in-memory `SharedWork` still coalescing in-flight calls.

## Line patterns

A route code is not one stop list. Koridor 8 runs via Tomang or via Cideng;
Koridor 9 has all-stop and toll patterns; 7 has toll patterns; L13E is an
express. A pattern is stored separately from the line:

- `line_patterns` (and `data/line-patterns.json`, loaded by `db:seed` and
  `db:sync`) carries `line_id`, `headsign`, `direction`, `pattern_type`, the
  ordered `stop_ids`, the shape, `service_days`, `toll`, `is_default`, and
  its source. The line identity, fare and colour do not change.
- The snapshot carries 34 GTFS-derived patterns: the daily Tomang and
  Sunday-scheduled Cideng patterns of 8; both 9 directions, the all-stop 9
  and the three toll runs; the 8A Sunday/CFD line (Jelambar–Juanda and
  Jelambar–Pasar Baru); 7 with its toll patterns; 4 with Kayu
  Putih/Bermis/Saharjo; 13, 13E and L13E; and 6A/6B with their
  Kuningan/Semanggi variants. 8A is a separate line, not folded into 8.
- Cideng is Sunday-scheduled in GTFS and the operator calls it situational
  when Tomang is congested; do not turn that into a guaranteed weekday
  departure. Cideng is not a separate route. 13E is a separate
  weekend/holiday route; L13E is the weekday express. The 17 national
  holidays for 2026 are in `packages/transit/src/calendar.ts` (SKB 3
  Menteri); 13E is active on them and L13E is suppressed. `cuti bersama`
  is not a national holiday for this rule.
- There is no public GTFS-Realtime vehicle feed. Do not add a live vehicle
  badge or an invented ETA. The research and the future adapter contract
  are in `research/realtime.md`; the planner stays schedule-based.
- `buildGraph` uses one pattern per line and direction, chosen from the
  requested endpoints: a direct pattern with both ends, then a pattern that
  serves an endpoint the default does not, then the default. A service day
  that does not include `at` is not offered. This prevents a search from
  changing patterns mid-ride as if it were staying on the same bus.
- A ride leg carries `patternId`, `patternLabel`, `patternService`, and the
  API adds the other variants with their stops, skipped stops and extra
  stops. The left panel offers a compact pattern list, not a literal tree;
  the selected pattern is marked and the map uses its shape.
- The agent has `list_line_patterns` and the pattern fields on
  `find_line`/`plan_journey`. It must say which pattern a journey boards and
  which stops that pattern skips or adds. A Sunday-only pattern is not
  "today" unless the tool says so. The car-free-day cases are the Sunday
  Cideng pattern and the separate 8A line.

## The monitor

- The worker holds one **filtered stream** (`/2/tweets/search/stream`) with a
  `from:<akun> -is:retweet` rule per operator. `from:` delivers both the
  account's Posts and its replies. There is no timeline poll and no cursor;
  the only recent search is the bounded catch-up below.
- The stream is live-only. When a connection opens the worker runs one
  bounded catch-up: **only original Posts** (`-is:reply`), only newer than
  the last stored Post or Reply, and never older than **eight hours**. It
  asks for one page, uses the last id as `since_id`, and does not request
  author expansions. A Post published while the connection was down and
  older than eight hours is not fetched. `/health` reports `connected`,
  `reconnects`, `lastPostAt`, `lastError` and the last `catchUp` result.
  Tavily remains the assistant's on-demand search; the manual
  notice-verification CLI may still use X.
- An X item is a **Post**; a **Reply** is a Post that answers another Post.
  The `from:<account>` rule delivers both. The stream requests
  `in_reply_to_user_id` and `referenced_tweets`, and every stored
  `social_posts` row records `metadata.postType` (`post` or `reply`),
  `inReplyToPostId` and `inReplyToUserId` when present. X usage rows record
  the same type.
- A Post may carry images. The stream and catch-up request
  `attachments.media_keys` and `media.fields`, store the image URLs in
  `social_posts.metadata.media`, and the classifier receives them as image
  parts. An image-bearing Post skips the text-only screen so an image-only
  announcement is not discarded before the classifier reads it. Every image
  is sent, in the Post's media-key order; a Post can carry up to four photos.
- Recent search names the long-form field `note_post`; the filtered stream
  still names it `note_tweet`. The request builders keep separate field
  lists and `xPostOf()` accepts both. Sending the wrong name truncates a
  long announcement at 280 characters. Neither search nor stream requests
  `expansions=author_id`; media expansion does not create User reads.
- Classification is a durable Postgres queue. Every stored post is claimed
  with `FOR UPDATE SKIP LOCKED`, read oldest-first, and retried with backoff.
  A failed read is never dropped; after eight attempts it is marked
  `needs_review`.
- Jev screens every text-only item with three questions (`disruption`, `restored`,
  `system`). The mark and corridor questions are asked only after an item
  passes the screen. The classifier itself has no tools: it returns the
  names it read, and the resolver grounds them against the network. This
  keeps the classifier to two turns and stops a tool loop from exhausting
  the model.
- The classifier sees only a narrowed list of open notices: the ones that
  share a line code, a stop name, or enough title vocabulary. It may only
  resolve or update ids from that list.
- A notice is about a **scope**: a stop, a corridor/rail line, or the
  operator's whole service. The classifier reads the names; the resolver
  grounds the stop names; when the announcement names a street, a stop the
  graph does not have, or a corridor code the snapshot does not carry, a
  second reader with tools (`NoticeGrounder`) decides. It has `find_stop`,
  `find_line`, `list_line_stops`, `find_street`, and `list_street_stops`; every id it returns is checked against the graph before
  it is written. A stop it keeps must stand on the corridor the notice
  names, so a same-named halt in another city can never be used.
- `find_street` asks Nominatim first and falls back to Overpass. A street
  name is common: "Jl. Damai Raya" exists in several districts, and the one
  that touches the corridor is the only one meant. The lookup groups the
  ways of one street, keeps the whole-name match, and the reader compares
  the stops on the road with the corridor's stops. It is cached, a miss is
  cached briefly, and two Overpass failures stop the fallback for ten
  minutes.
- A closed stop is not a closed corridor. The planner still routes through
  it; the API and the route tool plan from the nearest stop the rider can
  walk to when the stop they named is the boarding or alighting point, and
  the walk becomes a leg. `blocksJourney` decides whether a notice actually
  removes the journey: a stop the rider only passes does not.
- A stop can be **skipped** without being removed: a diversion may leave
  the ordinary road for a toll road, a flyover or another street and pass
  the old stops without serving them. A notice says so with `viaToll`.
  `data/toll-roads.json` holds the researched toll roads, gates and the
  routes that use them, with `confirmed`, `reported` or `conditional`
  confidence. `find_toll_routes` exposes it. Corridor 9 is **beside** the
  inner ring road, not on it by default; only some diversions use the toll.
- A notice can name a direction: a terminus ("arah Kota") or a compass word
  ("arah utara"). The classifier returns the name and the compass word; the
  monitor resolves them against the stop order, the heading of the next stop
  from the station the notice names (which works on a loop), and the bearing
  of each direction, and writes `platforms` — one `(line, direction, platform
  id)` entry per affected line. A platform-scoped notice is not matched to a
  journey that does not ride one of those entries, so one side of a road and
  one line at a shared station keep working. A terminus is matched against
  the station's aliases, not only its exact name.
- A notice carries an `event_key`, a `starts_at`, an `ends_at`, a
  `last_seen_at`, and a `last_checked_at`. A later announcement about the same event refreshes the
  same row; it does not create a duplicate. The first report owns the title
  and body, and the latest end wins. A follow-up that only adds a route does
  not rename a network-wide event.
- The main classifier also returns a model `duration` assessment:
  `horizon` (`hours`, `days`, `weeks`, `months`, `unknown`),
  `reviewAfterHours`, a reason and confidence. It is not a kind-to-hours
  table: a multi-week revitalisation and a four-hour accident are separated
  by reading the source and its images. When an explicit end exists the
  review is `null`. The classifier prompt has a concrete guard: a daily
  service window ("05:00-22:00") is not the event's `ends_at`.
- The monitor stores `review_at`, `review_state`, `last_verified_at` and
  `duration_assessment`. `expireStaleDisruptions()` skips every row with a
  model-assigned `review_at`; the old kind fallback (**8 h** for an
  incidental `diversion`/`closure`/`service-change`/`unknown`; 4 h delay,
  8 h weather, 48 h strike, 72 h maintenance) remains only for legacy rows
  without an assessment. An explicit `ends_at`, validity window, or future
  `starts_at` also wins.
- At `review_at`, `NoticeReviewAgent` runs (at most two notices per tick by
  default). It gets recent Posts, the notice history and Tavily news results.
  It returns `active`, `ended` or `unknown`, evidence URLs/quotes, confidence
  and the next `reviewAfterHours`. It may resolve a notice only when it has
  evidence. An `unknown` verdict keeps the notice active but marks it
  `unverified`; silence is not evidence of restoration. A failed review
  leaves the notice active and schedules a bounded retry, not a silent close.
- A new Post/Reply that confirms the same event still moves `lastSeenAt`; a
  later "layanan kembali normal" resolves the notice through the classifier,
  independently of the review queue.
- A small follow-up sweep re-reads open notices against the recent post
  corpus. It runs after a tick, is limited to `NOTICE_SWEEP_LIMIT`, and only
  closes a notice when the model confirms it from a post newer than the
  notice's last report.
- A notice can carry a **temporary diversion pattern** in
  `metadata.diversions`: the line and direction, the divergence and rejoin
  stops, the ordered via points (with `served` true only when the source
  says the bus opens its doors there), the borrowed geometry, the skipped
  stops, and an `approximate` flag, one pattern per direction.
  `withDiversions()` replaces only that span and keeps the line's identity
  and fare; the planner sees one trip, not a chain of borrowed corridors.
  Shapes are composed from the OSM-derived shapes of the borrowed
  corridors plus routed connector roads; a pattern without a sourced shape
  is labelled approximate and is never presented as official.
- A notice can carry **validity windows** (`disruptions.validity_windows`), not
  just one `ends_at`. A window has a start, an end, a scope and a quoted
  source. An event that closes one road in the morning and another route on
  the next day has two windows. `isActiveAt()` is the only test for "is this
  affecting the network now"; the map uses `activeNow`, the board can still
  show an upcoming window.
- A window is written by the verification agent, not by a date regex. The
  research and the design are in `research/agent-verification.md`. The agent
  plans searches, opens the operator/page source, extracts one window per
  route and day, quotes the sentence, and a second reader checks that the
  quote supports the date, start, end and scope. A window without evidence is
  not shown as active.
- When a planned event is named but no hours are given, the classifier sets
  `needsSchedule`. The monitor then asks a Tavily-backed researcher: a query
  planner writes the searches, Tavily returns the pages, and a reader with no
  tools extracts the window with a quote and a URL. The result becomes
  `starts_at`/`ends_at`, so the notice closes at the event's end instead of
  waiting for a fallback. An incidental accident has no schedule and is left
  with no end; the duration/review path handles it.
- Every paid call is written to `usage_events`: X calls keep the endpoint,
  requests, Posts read, the Post/Reply counts or type and the estimated
  **post-only** $0.005/Post cost. The runtime stream and catch-up do not
  request `expansions=author_id`, so there is no user-read term there; the
  manual CLIs may still expand profiles and are not part of the worker
  ledger. Model calls keep
  the operation, the model, the provider that answered, input/output tokens,
  latency and the cost OpenRouter reported. The dashboard is a later
  concern; the ledger is already there.
- The worker holds exactly one filtered-stream connection. The HTTP port is
  the single-instance lock: the stream opens only after `listen` succeeds,
  so a second worker exits with `EADDRINUSE` without touching X. A restart can
  overlap the previous connection's release at X and produce a 429
  `TooManyConnections`; the supervisor backs off up to 60 s and reconnects.
  SIGINT/SIGTERM closes the stream and the HTTP server before the process
  exits, so a normal restart does not leave a connection behind.
- A Post that announces a future temporary service is not forced into a
  notice. A broad, non-route-specific trigger (a service word plus a change
  word, or an image-only operator Post) sends it to `TemporaryServiceAgent`.
  That agent reads all images and returns a structured proposal; it never
  supplies station ids or coordinates. `TemporaryServiceWriter` resolves
  every stop name against the network, rejects an unresolved name, a code
  that belongs to a permanent line, an impossible window, or low confidence.
  A saved row is an overlay, not an edit of `data/transit-network.json`.
- `temporary_services` carries the code, name, operator, ordered station ids,
  daily windows, `starts_at`, `ends_at`, `review_at`, source Post, image
  URLs, quote and confidence. `withTemporaryServices()` adds a normal `Line`
  with `metadata.temporary: true`; `serviceAt()` refuses it before
  `starts_at` or after `ends_at`. The planner, map, `find_line` and
  `plan_journey` therefore use it like any other line. A journey may be
  planned for a future date while the line does not run today.
- `review_at` on a **temporary service** is a review reminder, not an
  operational end; the default is start + 14 days. The current review agent
  covers notices, not temporary-service overlays yet. A confidence below
  0.65 is stored but not applied. No HTTP endpoint writes a temporary
  service: the only writer is the agent path.
- The temporary-service reader and the classifier must be vision-capable for
  image announcements. `AGENT_MODEL` is `deepseek/deepseek-v4.1-flash-1017`,
  which OpenRouter reports as `text+image->text`; the live trial sent the
  four 9ST images to the real model. The X envelope is still stubbed, not the
  LLM.
- A real LLM trial on 30 October 2026 (Jev, main classifier, temporary
  service, review + Tavily) is recorded in
  [`research/agent-live-trial.md`](research/agent-live-trial.md). It is not
  part of `pnpm test`; the deterministic suite uses fakes/recorded outputs.
- The worker drains the queue every thirty seconds and exposes stream, queue
  and activity state on `/health` and `/api/monitor/activity`.

## The agent

- Construct agents with `new Agent({...})` from `@anvia/core`. There is no
  builder API.
- Every OpenRouter request is routed to the cheapest endpoint of
  `AGENT_MODEL` for that request, not a fixed provider. The model factory
  reads the live endpoint prices (cached for 60 s), weighs them with the
  request's input estimate and `maxTokens`, and sets `provider.order` with
  fallbacks. `provider.sort: "price"` remains the fallback when the price
  list cannot be read. The research is in `research/openrouter-routing.md`.
- The chat model id comes from `AGENT_MODEL`. The decision model id comes
  from `JEV_MODEL` and defaults to `typesafe/jev-1.14`; it is served through
  TypeSafe System One, not chat completions. The
  chat answer is capped at 16,384 output tokens and the classifier at 8,192,
  so a small provider balance can still serve a turn; the structured outputs
  are far smaller than that.
- Jev, through `@anvia/jev` and `decide()`, screens an announcement before
  the chat model: is it a disruption on this network, is it a restoration,
  and which operator does it concern. The mark and corridor questions are
  asked only after an item passes that screen. It does not write the
  notice, plan the route, or invent a halte id. A low probability skips
  the chat model. Anything uncertain, or a real disruption, still goes to
  the classifier, which grounds names with the resolver. If Jev is
  missing or fails, the classifier says so and keeps reading with the
  chat model. Jev is not the chat model: chat completions reject it.
- Every tool is read-only and returns a plain object the model can read.
  A tool that cannot answer returns a reason, not a guess.
- The catalog is English and semantic. The assistant and the notice reader
  share `find_line`, `list_line_stops` and `find_street`. The assistant uses
  `stops_on_street`; the notice reader uses `find_stop` and
  `list_street_stops` when a name needs grounding. The assistant also has
  `resolve_place`, `plan_journey`, `get_station`, `list_active_disruptions`,
  `find_toll_routes`, `find_jpo` and `search_news` (Tavily, on demand), plus
  `list_notice_history` (active and closed notices). The planner reads stored
  notices; Tavily is the only live search the chat model can call. The history
  tool is what lets the assistant answer "is it open again" and "why did the
  notice go".
- The news tool takes structured filters, not only a query. `search_news`
  accepts `timeRange`, `topic`, `includeDomains`, `excludeDomains` and
  `maxResults`. The model is told to narrow by time and domain; a broad query
  for today's closure returns last week's article.
- The news searches share a process-wide `SharedWork`: identical queries
  are coalesced, a successful answer is cached for 10 minutes, and only two
  calls run at once. This is what stops ten open tabs from making ten
  identical provider calls. The monitor's stream is separate from the chat
  path.
- The tool catalog is built per request. A tool whose credentials are
  missing is not added to the catalog; the model is told the source is
  unavailable instead of calling something that always fails.
- The disruption classifier returns a structured record. The station ids in
  that record are produced by the resolver, not by the model. The resolver
  is filtered to the systems the announcement names, so a KRL post can
  never ground to a Transjakarta stop.
- When a notice names when its effect ends, the classifier puts that
  instant in `endsAt` on its structured result. The monitor normalises it
  in Jakarta time (a date alone means the end of that Jakarta day) and
  stores it in `disruptions.starts_at` and `disruptions.ends_at`. The text
  is not parsed with a pattern. A notice with no end stays until a later
  announcement says the service is back, or until its model-assigned
  `review_at` is examined by the review agent. A legacy row without a
  duration assessment may still use the kind fallback; an agentic row never
  closes from silence alone.
- When the effect has more than one window, the verification agent writes
  `validity_windows`; `isActiveAt()` uses those windows and the map only
  marks a notice whose window covers now. The agent must quote the source
  for every window. The design is in `research/agent-verification.md`.
- A record whose id starts with `contoh:` is not part of the live feed.
  Tools still mark `contoh: true` if such a row is read, and the interface
  says "Sample watch" only for that row.
- The route tool answers with a **verdict**: `terbuka`, `terhalang` or
  `tidak-diketahui`, plus the fare and the distance. The instructions tell
  the model to lead with the obstruction when there is one, and to mention
  a change of vehicle only when there is one.
- Instructions describe **behaviour**, not permissions. The tool layer is
  the wall.

## Front end

Read `DESIGN.md` before touching the interface. The short version:

- Tailwind v4 through `@tailwindcss/vite`. There is no `tailwind.config.js`
  and no `postcss.config.js`.
- Colours come from the tokens in `apps/web/src/styles.css`. Never write a
  hex value in a component.
- The type scale is 40, 28, 20, 16, 15, 13 and 12 pixels, and 12 pixels
  is the floor. `research/tools/ux-visual/typography_check.py` reads the
  source and must report nothing: no size outside the scale, no colour
  outside the tokens, no wording that breaks the rules in `DESIGN.md`.
- The rider interface is English. A bus stops at a stop, a train at a
  station; a journey is a "journey"; a fare is a "fare"; the time is
  written "10:14 WIB" and rupiah is written "Rp5.000". Operator
  announcements stay in the language they were published in. The
  classifier still reads Indonesian posts. New summaries it writes are
  English, and place names stay as written.
- Icons are `lucide-react`, one icon per meaning, with a tooltip on every
  icon-only control.
- Layout is CSS Grid. No percentage flexbox arithmetic.
- The map owns the window. There is no bar across the top, and the
  controls float on the map: the search board in the top left, the answer
  below it, the window controls in the top right. The map has no zoom
  buttons and no information button. Scroll, pinch, and the keyboard still
  zoom, and the OpenStreetMap / OpenFreeMap credit is a line of text.
  The basemap is OpenFreeMap recoloured at runtime from the map tokens in
  `styles.css`, so the paper map follows the theme.
  With no journey chosen, the map draws the operating network: trunk lines
  at city zoom, with a halo and a mark for the mode (a busway stripe, a
  metro core, stitches for LRT, rails and sleepers for KRL), feeder lines
  as the map comes closer, two GeoJSON sources (the base side and the
  offset return). Halte and stasiun are symbols in the operator colour,
  not DOM markers: Transjakarta appears when the map is close, the railways
  earlier. A stop mark is the operator's official compact mark. On the
  idle map no incident plate is drawn: the service board carries the
  notices. Once a journey is open, or a notice is followed, the map marks
  the notices that matter.
  Under a journey the map keeps the trunk lines and the journey's own
  stops. The local lines and the full stop layer return when the journey
  is closed, so the route and the camera stay smooth.
- The dock is one service board with two sections, Lines and Notices. On a
  wide screen it sits in the bottom right; on a phone it is the sheet
  behind the Lines and Alerts tabs of the bottom bar. Opening the account
  sheet or the assistant slides it off; it is not removed with `hidden`,
  because that would skip the transition. The account sheet measures its
  content and animates that height, capped by its maximum. The Lines section is
  a compact operator strip, the vehicles of the current journey, a network
  summary and a map key; its height follows its content. The Notices
  section is a single chronological board of notices whose verified window
  covers now; a future window stays out of the board until it starts. It
  has a maximum height and scrolls inside it. A notice is about a stop, a
  corridor/rail line, or an operator's whole service, and the row says
  which. There is no "on map / no single stop" split and no filter: a
  corridor notice is shown as that corridor and lights it on the map, a
  stop notice frames its stops (a road closure can name several), and a
  network-wide notice is not a button. Severity is a rail, not another
  badge. The latest update is a separate line. The dock is not inside the
  search. `research/tools/ux-visual/layout_check.py` reads the source and
  must report nothing.
- The search is one surface, not a card with a form inside it. Its first
  line is the headsign: "Daily Route" in Barlow Condensed on a near-black
  board, then "Jabodetabek" in sentence case, without an icon. There is no
  clock or notice count in the header. On a phone it is the full width of
  the window. The button that runs the search is the last control of the
  form, and the button that swaps the two places sits next to it. The two
  place rows are joined by one vertical ink line, with a hollow From dot and
  a filled To dot. There is no hairline between them.
- On a phone a bottom app bar holds four places: Plan, Lines, Alerts and
  Ask. It uses a real navigation element, a static icon per place, and a
  2 px ink underline under the active label. There is no plate behind the
  label and no rule on the top edge. Lines and
  Alerts open the service board on that section; Ask opens the assistant
  over the map. The search stays visible above the assistant.
- On a phone the answer is a sheet above the bottom bar. It has a grab
  handle that collapses it to a peek and expands it again. The route board
  header carries a close button that dismisses the route and returns to
  the empty board. The journey header names the two ends with "From" and
  "To" labels and a route marker, not a horizontal rule. The destination
  name has no arrow.
- The journey is framed in the room the rider can see. The margins
  around it are the `--map-pad-*` variables in `apps/web/src/styles.css`,
  and the map reads them when it frames a journey. The height of the
  search bar on a phone is `--bar-h`.
- Motion is short and purposeful: an answer rises into place, a list
  of suggestions opens from its field, the map moves with `easeTo` and
  `fitBounds`, the dock folds in one height/grid transition, and the loading
  slit travels inside the headsign. A result puts three punch chads once at
  its ticket bite, flips the destination in once, and the map sends one
  enamel bead along the journey once. The only rotated mark is the Closed
  stamp on a blocked result, which lands once and then sits still. There are
  no pulse dots. `prefers-reduced-motion` puts the letters, the stamp, the
  chads and the bead in their final state.
- A name that is longer than its line runs instead of being cut into
  three dots, and it only runs while the reader points at it. The name
  of a stop is a button: pointing at it, focusing it or touching it
  opens a card with the details of the place.
- The notice board groups by service day: **Today first**, then
  "Overnight · carried over" for an event that started before today and is
  still in force. Within each group the newest announcement is first. A
  carried row prints the date and time; a today row prints the time. The
  header prints the current WIB date. The board is never cleared merely
  because the calendar day changed.
- The stops of a ride are open by default and can still be collapsed. A
  stop the vehicle passes without serving has a red dot, red strikethrough
  and the word "skipped"; its title carries the notice and the reason, so a
  pointer or a screen reader gets the danger text without opening another
  surface. The walk/transfer legs keep their own description.
- Every Transjakarta bus line, ride leg and focus line carries a small
  left-hand-traffic offset (negative in MapLibre, because positive is to
  the right); rail and walking keep their own alignment. The stored path
  still owns the shape, and a one-relation corridor is mirrored only when
  OSM has no second relation.
- In the itinerary the dashed timeline runs continuously from one mode
  plate to the next, through walks and transfers. It is not cut at a leg
  boundary, and the plate sits on top of it.
- Every operator in a ride row wears its official compact mark: the
  published symbol without the wordmark. `transjakarta-mark`, `mrt-jakarta-mark`,
  `lrt-jakarta-mark`, `lrt-jabodebek-mark` and `krl-mark` are the compact
  files; the map, the alternatives and the legs use them. The operator
  strip keeps the wordmark, where there is room.
- A notice row ellipsizes a long list of corridor codes and opens a panel
  on hover or focus with every affected line and the scope. The row itself
  still opens the original source, and the two actions do not fight.
- A notice row and its opened detail show freshness in plain language:
  "Checked …", "Next check …", or "No fresh update yet. Next check …".
  `unverified` is an internal review state, not a word shown to the rider. Explicit end/window text still leads.
- A ride's corridor code is a pattern-aware chip: the selected pattern is
  in the label ("9 via Tol", "9 Express", or "9"), and pointing at it opens
  a panel with the variants and the selected one highlighted. The old
  expandable "N patterns" disclosure is gone.
- The scheduled wait is a colour-coded chip next to the service class
  (for example "BRT  6-7 min"); the band word is not repeated in the row.
  The panel on hover explains the window, and colour is never the only
  carrier: the chip carries an accessible frequency label.
- The right dock collapses from an arrow in its header. The sections fold
  in one max-height/grid transition; only the header remains, and its
  controls become inert. The arrow points down when open and up when
  closed. On Lines the dock height follows its content; on Notices it takes
  its maximum height and the board scrolls. A tab change measures the new
  panel and animates one height transition, so the two heights meet without
  a jump. The mobile sheet uses the same header, without the collapse
  control.
- The departure tabs share the surface's pointer and hover treatment. "Now"
  uses a clock mark and "Leave at" a calendar mark. Each tab carries a hover
  popover explaining what it does. There is no night switch: the silent night
  rule follows the chosen departure, so a 23:00 journey prefers fewer dark
  walks even when the rider is looking in the afternoon. "Leave at" opens a small
  12-hour analog clock: tap a number or drag a hand, switch AM/PM, then
  choose the minute on the same face. Hovering the face previews the active
  hand without changing the chosen time. The native platform time picker is
  not used. No status copy sits outside the tab cards.
- A diverted ride says so in the route list: the borrowed line codes, the
  served via points, the approximate flag, and the stops it skips. The
  notice panel shows the same path, with alignment points distinguished
  from served points, and the source quote.
- A notice row expands in place, with a short height/opacity transition
  and a rotating chevron, into the stored original Post (text, author,
  time, X link) or the research excerpt and article link. The panel reads
  `social_posts` and `metadata.research` through
  `/api/routes/disruptions/:id/sources`; it does not call X or Tavily on
  click. A notice with only a URL still shows the link and says that the
  body is not stored.
- Full-height regions use `dvh`, never `vh` and never a fixed pixel height.
- Every asynchronous surface has a loading, an empty and an error state.
- The place field is a combobox: the focus stays in the input, the active
  suggestion is pointed at with `aria-activedescendant`, and the matched
  part of a name is marked only when the server reported the range. A
  place that is not a stop is answered by the local Overture extract
  first. A thin list falls back to Photon for a name that is still being
  typed and Nominatim for an address; with `GOOGLE_MAPS_API_KEY` set,
  Google Places (New) is the fallback instead, restricted to the
  Jabodetabek rectangle. The same place from two indexes is one row, and
  the list says "Places © Overture Maps" or "Powered by Google" when one
  of them answered. Saved places and recent journeys stay in the
  browser. The account's Places tab uses the same field; its find field
  opens with the saved places as recommendations and folds away once a
  suggestion has copied its place into the form.
- A rider who is standing somewhere can ask for the walk to the stop
  that serves that place. The browser gives the position, the server
  asks the pedestrian router for the path, and the leg shows the
  distance and the time. The walk is the first leg of the
  journey, on the map as well as in the list. It is one compact row: its
  title, where it goes, and its time on the title's line; it has no
  service class and no corridor code. When the routed path passes a named
  official JPO, the row says "Via JPO ...", and the map draws the bridge
  line in the ochre JPO layer. The same button marks the
  current place: the server reverse-geocodes it, the From field shows the
  address, and the route is asked for in one step when a destination is
  already set. The Places tab offers the same action and opens its form
  with the address prefilled.
- The marked current place is part of the chat context. The browser sends
  its name, address and coordinate with the turn; the API validates the
  box, and the tool reads it through the turn's store. When the From field is the
  marked place, the chat does not send it again as a typed origin.
- The map answers a pointer with a popover and a click with a move. The
  camera moves with `easeTo` for a point and `fitBounds` for a journey;
  `flyTo` is for a jump between places that are far apart. A zoom or a
  pan the reader makes stays until the journey being followed changes.
- The list of the journey and the map are one system: pointing at a leg
  in the list keeps that leg bright on the map.
- Every vehicle on the route board wears its operator's colour, not a
  generic route colour: walking is the dashed ink line, and a ride line takes
  the mode colour of its operator. When one journey uses the same operator
  twice, the second line takes the next token of the secondary palette
  (`--route-1` … `--route-6`), so two corridors never look like one road. The
  same line keeps the same colour when the rider switches alternatives.
  The current journey's legend sits under its summary, names each vehicle
  and its time, and lights that line on the map on hover or focus. A line
  on the map also carries a small hover card with its from/to and time, so
  the route is readable without opening the list.
- A route stop far away is an **enamel disc**: a paper fill in a ring of the
  operator's colour. Close up the disc becomes a small plate with the
  operator's official mark inside it, not a generic red dot; an
  origin, destination and transfer add a ring around it, while an ordinary
  intermediate stop is just the mark. A place that is not a stop is a
  paper-filled ring with a From/To border, not an operator mark and not a
  glossy dot. The same image is cached under a route-specific id, and an
  incident keeps its own plate. When the From and To ends stand on the same
  stop, the map draws one stacked mark with the two rings offset, and its
  popover names both ends; a click keeps it open.
- A journey chooses up to three alternatives with different primary lines,
  not just the fastest and the cheapest. 9 and 9A are different choices even
  when they share a destination.
- A ride on an announced temporary service says "Temporary service" next to
  its service class; it is not presented as a permanent corridor.
- Every alternative is checked with `routeIsClear` against every active
  notice. A candidate that boards, alights or changes at a closed stop, or
  rides a closed line, is dropped. If the primary is blocked and no clean
  alternative remains, the board says there is no open journey instead of
  offering a closed one.
- The "This journey" row uses one operator wordmark per mode, inline, with
  no line labels and no "Change of vehicle" text. A 9 → 5N journey is one
  Transjakarta mark.
- The mode colours are the operator's taxonomy, not the livery of the
  vehicles, and they are checked for colour-blind separation. A mode is
  encoded twice: colour and line width.
- No emoji anywhere in code, markup or copy.

## Evaluation

- `pnpm eval:notices` runs the labelled cases in `research/eval/notice-cases.json`
  through the real pipeline and a model judge. The judge compares against a
  human-written expectation and returns a verdict; nothing compares
  strings, because a correct answer may spell a place differently and a
  wrong answer may spell it exactly.
- The cases are real announcements the monitor read, plus rail
  announcements fetched once by `pnpm eval:fetch` and committed in
  `research/eval/corpus.json`. Fetching is allowed when a case is missing;
  the review is not a reason to fetch again.
- Evaluation is for model behaviour. A rule that can be tested exactly
  (geometry, a planner rule, a scope derivation) belongs in a unit or
  integration test instead.
- `pnpm eval:current-place` is the Anvia evaluation of the current-place
  assistant. The target is the real HTTP route, planner and model; the
  runner supplies the cases, the exact metrics and the report. The metrics
  are `tool_use` (the required and forbidden tools), `grounded_stops` (a
  network stop named by the answer must appear in a tool result or the
  marked place) and an `answer_quality` Anvia `llmJudge` that reads the
  expected behaviour, the tools, the plan and the allowed names. It writes
  `research/current-place-eval.json`; the readable findings are in
  `research/current-place-trial.md`. It is a manual live-model run, not
  part of `pnpm test`.
- Traces go to Langfuse through `langfuseObservability`. The eval run uses
  its run id as the session, so the classifier, the grounder and the judge
  of one run are one trace group. The current-place eval puts each case in
  its own session, `<run id>:<case id>`, and the trial uses one session for
  the whole run. Both are shown in the report. The API route names the
  trace `chat-rute`; the agent, turns, generations and tool calls are its
  children.

## Testing

- **Integration tests** live next to the code they exercise
  (`apps/api/src/app.test.ts`) and run against the real database. Do not
  mock the database.
- **End-to-end tests** live in `apps/web/e2e/` and drive the real
  application through Playwright, on a phone viewport and on a desktop one.
- Unit tests are welcome for pure logic, but the priority is integration and
  end-to-end coverage. Prefer a test that exercises the whole path over
  several tests that exercise a mock.
- `pnpm trial:current-place` runs the real configured model against the
  current-place scenarios through the real API: route from here, where am
  I, no current place, a position outside Jabodetabek, no destination, a
  saved place used by its label, and a position too far from a stop. It
  writes `research/current-place-trial.json`; the findings and the case
  table are in `research/current-place-trial.md`. It does not touch X. It is a
  manual trial, not part of `pnpm test`, because a live model costs money
  and changes its wording.
- `pnpm eval:current-place` is the same feature through the Anvia eval
  runner. The trial is the strict regression check with a written pass/fail
  per scenario; the eval is the behaviour score with an LLM judge and the
  same exact grounding checks. Both share
  `apps/api/src/cli/observed-agent.ts`, so both send the same trace to
  Langfuse. Run both after a change to the current-place contract.
- `src/x-stub-trial.test.ts` is the offline X API trial: a real local HTTP
  server returns the v2 `data`/`includes.media`/`meta` envelope with four
  images and a `note_post`; the real client, writer, table and planner run on
  it. No live X call is made. `src/temporary-service.test.ts` covers the
  writer and overlay; `apps/api/src/temporary-service.test.ts` covers the
  HTTP planner.
- **A test never truncates a shared table.** The worker queue ignores
  `test_` handles, so the monitor's fixtures use a unique `fixture_` handle
  and remove only their own rows; a stray test notice must not become the
  target of a real announcement. `pnpm test` runs the packages serially
  (`turbo run test --concurrency=1`) because they share one development
  database. Stop the worker while the integration tests run, or run them
  against a database the worker is not filling.

## Definition of done

A change is finished when:

- `pnpm typecheck` is clean,
- `pnpm lint` is clean,
- `pnpm test` and `pnpm test:e2e` pass,
- the change follows the boundaries above,
- and the documentation (`AGENTS.md`, `DESIGN.md`, `README.md`) still
  describes the code as it is.

## Prohibited

- Writing a `console.log` in the browser.
- `any` in TypeScript. Use `unknown` and narrow it.
- `!` non-null assertions outside of tests.
- A second `.env`.
- A hard-coded coordinate, station name or duration that came from a
  memory rather than from the data.
- Commenting out a failing test instead of fixing it.
