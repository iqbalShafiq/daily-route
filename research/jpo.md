# JPO and pedestrian access in Jabodetabek

## The question

A rider should not be told to walk to a halte the long way round because the
map does not know about the pedestrian bridge (JPO) or the underpass that
crosses the road. The planner has to know which stop is on the other side of
a crossing, and the assistant has to be able to name the bridge without
inventing one.

## The sources

### The official DKI Jakarta points

Dinas Bina Marga Provinsi DKI Jakarta publishes `JPO Bina Marga 2024` on
Jakarta Satu:

- Feature service:
  `https://jakartasatu.jakarta.go.id/server/rest/services/Dinas_Bina_Marga/JPO_Bina_Marga_2024/FeatureServer`
- 203 points, `PERIODE_DA` 2025, retrieved 2026-11-05.
- Fields include the asset registration number, object name, address,
  kelurahan/kecamatan, type (`JPO` or `SKYWALK`) and a remark. Many remarks
  name the busway halte: "BUSWAY GROGOL 1 & 2", "BUSWAY DUKUH ATAS",
  "BUSWAY SIMPANG KUNINGAN" is **not** in the list.
- The layer is a point per bridge. It does not carry the bridge line, the
  stairs, a lift or the entrance side.

The city also has an "Underpass dan Flyover" layer. It is a road layer
(road flyovers and underpasses), not a pedestrian crossing layer, so it is
not merged into the JPO registry. A road underpass is not a pedestrian JPO.

### OpenStreetMap

`highway=footway` or `highway=pedestrian` with `bridge=*` or `tunnel=*`
inside the Jabodetabek box (-6.7, 106.4, -6.05, 107.2). The query returned
1,638 ways. OpenStreetMap is ODbL 1.0 and is the only source for Bodetabek
and for the line geometry.

## The merge

`pnpm data:jpo` writes `data/jpo-network.json`.

1. An official point takes the nearest OSM bridge line within 80 m. It keeps
   the official name, address, type and remark, and the OSM line becomes its
   geometry. The result is `confidence: "official-line"`.
2. An official point with no line within 80 m stays a point and is marked
   `confidence: "official-point"`. It is drawn but is never used to route a
   walk.
3. An OSM bridge already used by an official point is not repeated.
4. Remaining OSM bridges are kept only when they are named as a JPO,
   skywalk, penyeberangan or busway, or when an end is within 120 m of a
   transit stop. Every other OSM bridge is a park or estate bridge, not
   access to the network.
5. A stop within 120 m of an end is linked to the bridge. The link carries
   the stop id, its name, the distance and the end of the bridge nearest it.

## What the build produced

- 801 records.
- 203 official records.
- 192 official records with an OSM line; 11 point-only.
- 598 OSM-only records near a stop or named as a JPO.
- 772 records linked to at least one transit stop.
- The committed file is 948 KB.

The official layer is DKI Jakarta only. The 598 OSM records cover the rest of
Jabodetabek where the bridge stands beside a stop; they are marked
`official: false`. No claim is made that a park bridge in Bogor is a JPO.

## How the planner uses it

The access walk is still asked of the pedestrian router; the returned path
is the only path the map draws. The JPO registry changes two things:

- When choosing the boarding or alighting stop, a bridge that connects the
  place to the stop is weighed as the walk. `jpoWalkEstimate` accepts the
  bridge only when the rider is nearer its entry than its far end, and the
  stop is nearer its exit than its entry. A bridge that is merely beside the
  walk is not used.
- The routed walk is matched to the bridge lines. When the path passes
  within 20 m of a named official bridge, the walk leg carries `jpo` and the
  route board says "Via JPO ...". An unnamed OSM segment is not promoted to a
  named JPO.

The map draws a named official bridge as a thin solid ochre line with a
paper casing from zoom 12.5; its two end rings appear at zoom 14. An OSM-only
bridge is a quiet dashed ink line from zoom 15. No bridge carries a label;
the pointer names it and the stops it serves. The line is not drawn at city
zoom, where 801 bridges would be a scribble.

The assistant has `find_jpo`. It returns only records in the registry, with
their name, kind, source and nearby stops, and it says when there is no
record. The `plan_journey` result carries the bridges recorded beside the
boarding and alighting stops. The prompt tells the model that an underpass
is not a JPO and that a bridge near a stop is not proof that the walk uses
it.

## The cases

### Jalan Dokter Susilo II A to Simpang Kuningan

This is the case that started the work. The fastest itinerary boards at
Grogol Reformasi. The walk is 720 m and the routed path passes the official
`JPO JL. LETJEN. S. PARMAN` (13 m long, linked to Grogol Reformasi and
Grogol). The route board now says "Via JPO JL. LETJEN. S. PARMAN". Without
the bridge, the walk looked like a detour around the road; with it, the
reason for the route is visible.

### Simpang Kuningan and the Kuningan underpass

There is **no official JPO at Simpang Kuningan** in the 203-point layer.
The nearest official point is the Denpasar JPO, about 833 m away. OSM has
unnamed footbridges within 79–162 m of the halte. They are kept as
`Footbridge` records linked to Simpang Kuningan, but they are not given a
name. The Kuningan pedestrian underpass is not in the official JPO layer and
is not in the OSM bridge/tunnel query. The registry therefore says what is
missing instead of turning a road underpass into a JPO. This is the correct
answer for a data-first product: the app must not invent a crossing.

## Testing

- `packages/transit/src/jpo.test.ts` covers the bridge selection and the
  ordering of a named official bridge ahead of an unnamed OSM segment.
- `packages/ingest/src/jpo.test.ts` covers official matching, the point-only
  case, the stop link and the rejection of a park bridge.
- `packages/agent/src/tools.test.ts` calls `find_jpo` exactly as the model
  does.
- `apps/api/src/app.test.ts` checks the registry endpoint and the stop
  filter against the committed file.
- The end-to-end planner test checks that a place endpoint is drawn as its
  own circle; the route board test checks the compact walk row.

## Refresh

```bash
pnpm data:jpo              # official points + OSM lines, cached in data/raw
pnpm data:jpo -- --refresh # ignore both caches
```

Run `pnpm data:jpo` after a network rebuild (`data:ingest`, `data:gtfs`,
`data:enrich`) so the stop ids in the registry are the current ones. The
official layer is refreshed independently of the transit snapshot; the
`generatedAt` and `retrievedAt` fields say when.

## Sources and licences

- Dinas Bina Marga Provinsi DKI Jakarta, `JPO Bina Marga 2024`, Jakarta Satu.
  City asset data, published through the Jakarta Satu geospatial portal.
- OpenStreetMap contributors, ODbL 1.0, footway and pedestrian bridges.
- The notice is in `data/JPO-NOTICE.txt`.
