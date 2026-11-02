# Directions, platforms and the map

## The question

Should a corridor be drawn once, or once per direction? And how should the two
halte on opposite sides of a road be modelled, when some halte serve both
directions and some stops exist in only one direction?

## What the references say

- **GTFS** separates trips with `direction_id` (0/1) and expects each
  direction to have its own ordered `stop_times` and its own `shape_id`.
  Opposite-direction stops are distinct `stop_id`s with their own coordinates
  and `platform_code`; grouping is done with a parent station
  (`location_type=1`), not by merging the two roadside poles. The reference is
  explicit that a return is not merely the reversed stop list.
  ([gtfs.org reference](https://gtfs.org/documentation/schedule/reference/),
  [best practices](https://gtfs.org/documentation/schedule/schedule-best-practices/))
- **OpenTripPlanner** builds a `TripPattern` per direction: the pattern is the
  ordered stops plus the shape. A `RegularStop` "can be a bus stop on one side
  of a road"; a `Station` groups stops. The planner indexes patterns, not a
  single line list. ([OTP data model](http://dev.opentripplanner.org/apidoc/2.2.0/data.html))
- **Transitland** stores one route geometry plus direction-specific shapes and
  `RouteStopPattern`s. ([Transitland](https://www.transit.land/documentation/rest-api/routes))
- **Mapbox** and **Google** draw a route-level line, not one line per
  direction; parallel alignments are separated with `line-offset`, and arrows
  are a symbol layer along the line. Mapbox's traffic tileset recommends an
  offset to distinguish the two directions of a two-way road.
  ([Mapbox transit](https://docs.mapbox.com/data/tilesets/reference/mapbox-transit-v2/),
  [line-offset](https://docs.mapbox.com/style-spec/reference/layers/#paint-line-line-offset))

The consensus: **model per direction, draw per route, split only where the
paths differ**. A lane-level pair of lines is for close zoom; the city view
stays readable with one line per corridor.

## What our data did

The snapshot already stores a geometry and a stop list per direction. But the
merge collapsed both directions into one station: all 229 lines with two
directions share station ids (mean Jaccard 0.90), and 40 lines have stops that
exist in only one direction. Eighteen stations even carry a direction in their
name ("Harmoni Temporer Arah Utara") while being used by both.

That loses the boarding side, makes a stop closure ambiguous, and hides that
the return can skip a stop.

## The model we now use

- **Station** — the stop area a rider searches for and changes at. Unchanged,
  so transfers and the graph keep working.
- **Platform** — `lineStop.platform`: a stable id, name, coordinate and code
  (the operator's stop code when the source has one) for the point the vehicle
  stops at, per direction. The code comes from GTFS `platform_code`/`stop_code`
  or OSM `ref`/`local_ref`; `data:gtfs` fills a missing code from a GTFS stop
  within 12 m (or 30 m with the same name). 2,749 of 16,506 line-stop platforms
  have one: 100% for MRT and LRT Jakarta, 90% for KRL, and 14% for
  Transjakarta, whose GTFS leaves most `platform_code` empty. The id is built from the station and the
  coordinate, so two lines that share a bay share the id and the two sides of
  a road do not. It is the matched OSM/GTFS node for that direction, not the
  station centre. A median halt has the same platform for both directions; a
  roadside pair has two.
- **Direction summary** — `from → to`, computed from the direction's own stop
  order (`directionSummary`). The map line and the ride leg carry it.

The merge now matches a repeated stop name by its **place along this
direction's path**, so the return gets the other platform instead of the same
two nodes in the same order.

## The map

- One line per route when the two directions follow the same road; the return
  is not drawn twice. This is the current `networkOverview` behaviour and it
  matches the vendors above.
- When the directions diverge, both paths are drawn (already the case).
- The direction is part of the line (`direction`, `label`, `oneWay`). The map
  draws the forward side at every zoom and the return as an offset line from
  zoom 13.4, so the two sides separate only when the camera is close; a
  one-way line stays in the base layer. The platforms are drawn as points from
  zoom 14.6, one per side. The city view stays one line per corridor.

## The agent

- A ride leg carries `arah`, `labelArah`, `platformNaik` and `platformTurun`.
- `find_line` returns the directions of a line; `list_line_stops` returns one
  entry per direction with its label, stops and platforms.
- The instructions tell the model to name the boarding direction and side,
  and never to assume the return stops at the same places.

## Compass directions and platform scope

An announcement often says "arah utara" rather than a terminus. The classifier
returns the compass word it read. The monitor first measures the heading of
the next stop from the station the notice names — which works on a loop and on
a curve — and falls back to the bearing from the first to the last stop. A
line whose ends are less than 300 m apart has no overall bearing; without a
station heading it stays unresolved instead of being guessed.

A terminus name is matched against the endpoint station's name **and its
aliases**, with "Halte", "Stasiun" and "Terminal" ignored, so "Terminal Blok
M" reaches the station the network calls "Blok M".

When the direction resolves, the notice carries `platforms`: one entry per
affected line with that line's direction and the physical platform id. The
match is therefore line + direction + bay: the northbound side of one corridor
does not close the southbound side, and does not close another line at the
same station. `matchDisruptions` drops the notice unless the
journey rides one of those pairs, so a northbound closure no longer closes the
southbound side or another line at the same station. A notice that names only
a stop and no direction keeps its old stop scope.

## Limits

The platform is as good as the OSM node the relation names. A stop whose
relation has no node keeps the curated coordinate, which is one side only;
that is recorded as the platform, not silently treated as both. The graph and
the planner still use the station, so a platform-level closure narrows the
notice's scope but does not split the routing node.
