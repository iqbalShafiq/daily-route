# Data completeness

Snapshot: `data/transit-network.json`, generated 2026-10-24T16:19:28Z.
It holds 255 lines, 5,711 stations and 16,506 line stops. A station that no
line references is still written; 40 are in that state (planned East-West
stations and duplicates), and they are not routable.

## The table

| Dimension | Filled | Of total | Source |
|---|---|---|---|
| Coordinates | 5,711 | 100% | OSM route relations, the operator GTFS for lines with no relation |
| Line stop lists | 16,506 | 100% | curated reports + OSM relations + GTFS |
| Corridor bounding box | 255 lines | 100% | computed from the stored geometry |
| Street name | 5,679 | **99.4%** | OSM named roads, nearest within 120 m |
| Kelurahan/desa | 5,711 | 100% | `cahyadsn/wilayah_boundaries` polygons |
| Kecamatan | 5,711 | 100% | same, joined by code |
| Kota/kabupaten | 5,711 | 100% | same |
| Provinsi | 5,711 | 100% | same |

Seventeen stops fell on a boundary sliver; they were assigned to the nearest
polygon within 300 m and carry `metadata.boundaryApproximate: true`.

## The street gap

| System | With a street | Of total |
|---|---|---|
| Transjakarta | 5,494 | 5,517 |
| KRL Jabodetabek | 96 | 100 |
| MRT Jakarta | 58 | 62 |
| LRT Jakarta | 11 | 11 |
| LRT Jabodebek | 20 | 21 |

The fill reads **named highways only**, ignores motorways (a halt does not
stand on a toll road), and assigns the nearest road within **120 m**. That
radius covers a station building or a terminal set back from the road it
serves. A stop further than that is left empty instead of being named after a
road in another neighbourhood.

Thirty-two stops remain. Their distance to the nearest named road:

- **126–190 m** — Sentul, Tanah Apit, Pondok Rajeg, Polsek Penjaringan,
  Ujung Menteng (MRT and Transjakarta), Gg. Suzuki, Seberang Sowan, Transera
  Harapan Indah, Halim (LRT), Universitas Esa Unggul, Lumpang Parayasa.
  These stand inside a terminal, campus or station yard; the road is mapped,
  the stop is simply set back. Halim and Esa Unggul are deliberately not
  filled: the nearest road there is a toll or an inspection road, not the
  address of the place.
- **233–376 m** — Rawa Selatan 2, Bogasari, South City Cinere, Mall Taman
  Palem 1, Grand Kota Bintang, Bunder, Sentul City, Rusun Padat Karya, Grand
  Cempaka Hotel, Summarecon Bekasi. Malls, rusun and hotel forecourts.
- **569 m and beyond** — Pasir Gadung, Cikoya, PIK 2, Rusun Nagrak, Gunung
  Putri, Sumberjaya. These are worth a coordinate review before a street is
  attached; at that distance the coordinate, not the road, is the likely
  error. Pasir Gadung and Sumberjaya are planned East-West stations and are
  not routable; Cikoya, Gunung Putri, PIK 2 and Rusun Nagrak are operating
  stops in industrial or newly built areas whose access roads are unnamed in
  OSM.

The name of a halt is not a substitute for the road: of the stops that
already had an OSM street and a name beginning "Jalan …", only **6.1%**
agreed with it. The name points at the neighbourhood the halt serves.

## Route geometry

The same audit found ten line-directions whose stops were clamped to one
point of the path: JAK.45, JAK.44, KRL C, 6Q, 7D, 7V, JAK.11 and A. The cause
is a path that stops short of the stops or loops back through them, so the
nearest vertex of most stops is the same one and `distanceFromOriginKm` kept
the same value.

The distances now follow the **stop chain** when half the stops share one
point, while the road stays the drawn path. JAK.45 forward went from 91 flat
stretches to 0; KRL C forward from 44 clamped stops to 0. The stretches that
remain are stops clustered at a terminal (the run spans less than 0.5 km), so
they share a distance on purpose.

This is a fallback, not a repaired relation: the OSM relation or GTFS shape
that covers only part of a route still draws only that part. Fixing the
source is a separate ingest task.

## Known exceptions

**Simpang Sentul (P11)** was stored at `-6.1388, 106.2522`, the Walantaka
interchange in Serang, 90 km from the route. The curated list had no
coordinate and the geocoder matched the name without the corridor. It now
carries `-6.531293, 106.85176` from GTFS stop `B08177P`, and the note in
`research/data/transjakarta-routes-extra.json` records why. P11 forward
distances are now 41.6 km at that stop instead of 98.5 km.

**Sukaresmi** was in the curated Bogor line with no coordinate, and the
geocoder placed it in Megamendung, 20 km from the railway. KAI Commuter said
in 2025 that the station has never been built and has no construction plan;
the entry is now marked `(planned)` and the ingest drops it from the operating
line. The source note and the news links are in `research/data/rail-jakarta.json`.

**Three MRT East-West stations** (`Cibadak`, `Sumberjaya`, `Wanajaya`) stand in
Sukabumi and Karawang. The EW line is `planned`, so it is not routable; the
coordinates are still worth reviewing when the planned alignment is published.

## Reproduce

```bash
research/tools/geo/fetch-boundaries.sh   # 19 SQL dumps, about 14 MB
pnpm data:enrich                         # write the hierarchy into the snapshot
python3 research/tools/geo/street-overpass.py   # resumable; tiles in data/enrichment/roads
pnpm db:sync                             # apply it; notices are untouched
```

`data/admin/` and `data/enrichment/` are derived and ignored by git. The
street pass uses the OSM France Overpass mirror, one 0.025 degree tile per
request, cached per tile so an interrupted run resumes.

## Sources and licences

- **Boundaries**: [cahyadsn/wilayah_boundaries](https://github.com/cahyadsn/wilayah_boundaries),
  MIT. Geometry derived from Badan Informasi Geospasial; codes from
  Kemendagri. Downloaded 2026-10-24.
- **Coordinates, streets, route geometry**: OpenStreetMap, ODbL, through the
  Overpass API and the route relations.
- **GTFS stops**: Transjakarta open GTFS feed,
  `https://gtfs.transjakarta.co.id/files/file_gtfs.zip`.
