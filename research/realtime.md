# Real-time Transjakarta: what is public, what is not

27 October 2026. This note records the search for a live vehicle and
headsign feed, and why the product still shows a scheduled pattern instead
of a bus on a map.

## The short answer

There is **no public GTFS-Realtime vehicle-position feed** for Transjakarta
that can be used by this repository without a partner agreement. The
operator does publish live data, but it reaches riders through Google Maps,
the TJ: Transjakarta app and commercial journey planners. Transitland and
the Mobility Database list only the static GTFS feed. The old anonymous MQTT
feed is no longer readable without authorization, and the Traccar web
tracker requires a login.

That is an external data-access limit, not a planner limit. Do not scrape
the app, the Traccar session or an undocumented MQTT broker. A scheduled
pattern with a headsign and an operator notice is honest; a fabricated
vehicle position is not.

## What was checked

### Static GTFS

- <https://gtfs.transjakarta.co.id/files/file_gtfs.zip>
- `Last-Modified: Mon, 27 Jul 2026 06:49:42 GMT`; files dated 24 Jul 2026.
- 7 service ids, no `calendar_dates.txt`, no `block_id`.
- 752/753 `frequencies.txt` rows are headway-based (`exact_times=0`); this
  means the schedule is a headway, not a set of exact trip times.
- The feed is the source used by `data/gtfs` and by the pattern import.
  It contains `trip_headsign`, `shape_id`, `direction_id`, `stop_times` and
  frequency rows, but no vehicle positions.

### Public registries

- Transitland lists the Transjakarta **GTFS** feed only; there is no
  `f-transjakarta~id~rt` record:
  <https://www.transit.land/feeds?search=transjakarta>
- Mobility Database returns the static feed; no public GTFS-RT URL:
  <https://mobilitydatabase.org/feeds?search=transjakarta>
- Catenary and GTFS.zone show schedules and shapes, not live vehicles:
  <https://catenarymaps.org/en/agency/Transjakarta>,
  <https://sites.gtfs.zone/transjakarta/>

### Operator statements

- Transjakarta announced real-time information on Google Maps on 11 July
  2024: <https://transjakarta.co.id/news/real-time-transjakarta-information-now-available-on-google-maps>
- The TJ: Transjakarta app advertises live vehicle position and arrival
  information, updated 30 Sep 2026:
  <https://play.google.com/store/apps/details?id=com.transjakmobile>
- The Jakarta Post, 24 Sep 2024, reports 95% tracking accuracy in the app:
  <https://www.thejakartapost.com/indonesia/2024/09/24/transjakarta-launches-new-app-with-accurate-bus-tracking>

Those channels are distribution partners, not a documented open API.

### The unofficial MQTT broker

An open-source project (`BroNils/open-tj`) documents an anonymous MQTT
WebSocket at `wss://mqtt.tj.co.id:8084/mqtt` and an armada topic
`/mobile_armada/#`. A direct probe on 26 October 2026 completed the
WebSocket upgrade but the broker answered `CONNACK` return code 5
(**not authorized**). `mqtt.js` using the same URL reported
`Connection refused: Not authorized`. It is not a usable public source.

- <https://github.com/BroNils/open-tj>
- <https://github.com/mugnimaestra/tj-live> (a private app that used MQTT)

### The official bustrack page

- <https://bustracker.transjakarta.co.id/> is a login page (`NIK` +
  password); it is not a public feed.
- <https://bustrack.transjakarta.co.id/> is a Traccar UI. `/api/server`
  answers, but `/api/positions` returns **401 Unauthorized**. Do not use a
  session or a scraped token.

## The strategy

### 1. Keep the deterministic schedule

The planner already chooses a pattern by service day, endpoint and head
sign, and the API returns the pattern, its stops and its skipped stops.
This is the fallback whenever no live feed is available.

### 2. Do not invent a live layer

A `Live` badge, a moving bus or an ETA must come from a feed with a
timestamp and a trip/vehicle identity. No feed means no live claim. The
assistant should say "schedule only" rather than estimate a vehicle.

### 3. Make the live adapter an explicit boundary

When Transjakarta (or a partner) provides a GTFS-Realtime URL, the adapter
should:

1. read `FeedMessage` VehiclePositions and TripUpdates;
2. join `trip.trip_id` to the static trip and to the pattern id;
3. expose `vehicleId`, `tripId`, `patternId`, `headsign`, `latitude`,
   `longitude`, `bearing`, `timestamp` and the next-stop ETA;
4. attach only a fresh vehicle (for example < 90 s) to the matching
   pattern;
5. show the live headsign and position, with the schedule as fallback.

A feed configuration is not enough for this repository yet: the protobuf
parser, the trip/pattern join and the freshness rules all have to be tested
against a real feed. Without a URL they would be dead code.

### 4. Ask for access, not a scrape

The correct next step is a data-access request to PT Transportasi Jakarta
(or a partner with a redistribution right) for a GTFS-Realtime endpoint and
its terms. The official app and Google Maps prove the data exists; they do
not grant a public right to redistribute it.

## What the current build does

- static GTFS patterns, service days and headsigns: implemented;
- pattern selection and skipped/extra stops: implemented;
- live vehicle position or arrival: not claimed, because no public feed;
- operator announcements from X/news: implemented separately;
- `find_toll_routes` and notices cover planned disruptions, not live
  vehicle positions.

The remaining gap is therefore a partnership/authorization gap, not a
missing algorithm.
