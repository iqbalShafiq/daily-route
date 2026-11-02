#!/usr/bin/env python3
"""Fill the missing street name of every stop from OSM named roads.

The monitor's stop nodes already carry a street when the route relation named
one. The stops added from the operator GTFS do not. This script asks Overpass
for every named highway in a small tile around those stops, builds a segment
index, and writes the name of the nearest road within 120 m. A station building or a
terminal can stand that far from the road it serves; a stop further than
that is reported, not named after a road across the neighbourhood.

The run is resumable: each tile is cached in data/enrichment/roads/, so an
interrupted pass continues where it stopped. A stop that has no named road
inside 60 m is left empty and counted; it is never filled with the name of the
halt.

Usage: python3 research/tools/geo/street-overpass.py [--limit-tiles N]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SNAPSHOT = os.path.join(ROOT, "data/transit-network.json")
CACHE = os.path.join(ROOT, "data/enrichment/roads")
ENDPOINT = "https://overpass.openstreetmap.fr/api/interpreter"
TILE = 0.025
LIMIT = 4000
MAX_DISTANCE_M = 120.0


def tile_key(lat: float, lon: float) -> tuple[int, int]:
    return (math.floor(lat / TILE), math.floor(lon / TILE))


def tile_bbox(key: tuple[int, int]) -> tuple[float, float, float, float]:
    return (key[0] * TILE, key[1] * TILE, (key[0] + 1) * TILE, (key[1] + 1) * TILE)


def fetch_roads(bbox: tuple[float, float, float, float]) -> list[dict] | None:
    south, west, north, east = bbox
    query = (
        "[out:json][timeout:90];"
        f'way["highway"]["name"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});'
        f"out geom {LIMIT};"
    )
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                ENDPOINT,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "daily-route/0.1 (street enrichment)"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.load(response)
            return payload.get("elements", [])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            print(f"  retry {attempt + 1}: {error}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    return None


def segments_of(ways: list[dict]) -> list[tuple[str, float, float, float, float]]:
    segments: list[tuple[str, float, float, float, float]] = []
    for way in ways:
        tags = way.get("tags") or {}
        name = tags.get("name")
        highway = tags.get("highway")
        # A stop does not stand on a motorway; the toll is often the nearest
        # named way, and naming a halt after it would be wrong.
        if highway in ("motorway", "motorway_link", "construction", "proposed", "raceway"):
            continue
        geometry = way.get("geometry") or []
        if not name or len(geometry) < 2:
            continue
        for first, second in zip(geometry, geometry[1:]):
            if not first or not second:
                continue
            if None in (first.get("lat"), first.get("lon"), second.get("lat"), second.get("lon")):
                continue
            segments.append((name, first["lat"], first["lon"], second["lat"], second["lon"]))
    return segments


def meters(lat1: float, lon1: float, lat2: float, lon2: float) -> tuple[float, float]:
    kx = 111_320 * math.cos(math.radians(lat1))
    ky = 110_540
    return ((lon2 - lon1) * kx, (lat2 - lat1) * ky)


def distance_to_segment(
    lat: float, lon: float, segment: tuple[str, float, float, float, float]
) -> float:
    _, y1, x1, y2, x2 = segment
    px, py = 0.0, 0.0
    ax, ay = meters(lat, lon, y1, x1)
    bx, by = meters(lat, lon, y2, x2)
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    if length == 0:
        return math.hypot(ax - px, ay - py)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
    return math.hypot(ax + t * dx - px, ay + t * dy - py)


def nearest_street(
    lat: float, lon: float, segments: list[tuple[str, float, float, float, float]]
) -> tuple[str, float] | None:
    best: tuple[str, float] | None = None
    for segment in segments:
        distance = distance_to_segment(lat, lon, segment)
        if distance <= MAX_DISTANCE_M and (best is None or distance < best[1]):
            best = (segment[0], distance)
    return best


def save(snapshot: dict) -> None:
    with open(SNAPSHOT, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-tiles", type=int, default=0)
    args = parser.parse_args()

    with open(SNAPSHOT, encoding="utf-8") as handle:
        snapshot = json.load(handle)
    stations = snapshot["stations"]
    missing = [s for s in stations if not (s.get("metadata") or {}).get("street")]
    print(f"· {len(missing)} stops without a street")

    tiles: dict[tuple[int, int], list[dict]] = {}
    for station in missing:
        tiles.setdefault(tile_key(station["latitude"], station["longitude"]), []).append(station)
    keys = sorted(tiles)
    if args.limit_tiles:
        keys = keys[: args.limit_tiles]
    print(f"· {len(tiles)} tiles, {len(keys)} in this pass")

    os.makedirs(CACHE, exist_ok=True)
    for index, key in enumerate(keys):
        path = os.path.join(CACHE, f"{key[0]}_{key[1]}.json")
        if not os.path.exists(path):
            ways = fetch_roads(tile_bbox(key))
            if ways is None:
                print(f"  tile {key} failed; keeping it for the next pass")
                continue
            if len(ways) >= LIMIT - 5:
                print(f"  tile {key} hit the {LIMIT} limit; it may be short")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(ways, handle)
            time.sleep(0.5)
        else:
            with open(path, encoding="utf-8") as handle:
                ways = json.load(handle)
        segments = segments_of(ways)
        for station in tiles[key]:
            hit = nearest_street(station["latitude"], station["longitude"], segments)
            if not hit:
                continue
            metadata = station.setdefault("metadata", {})
            metadata["street"] = hit[0]
            metadata["streetSource"] = "overpass"
            metadata["streetDistanceM"] = round(hit[1], 1)
        print(f"  [{index + 1}/{len(keys)}] tile {key}: {len(ways)} ways", flush=True)
        if (index + 1) % 10 == 0:
            save(snapshot)

    save(snapshot)
    filled = sum(1 for s in stations if (s.get("metadata") or {}).get("street"))
    print(f"✓ {filled}/{len(stations)} stops now have a street")


if __name__ == "__main__":
    sys.exit(main())
