#!/usr/bin/env python3
"""Fill the missing street name of every stop from Photon (OpenStreetMap).

The OSM route relations give a street to 2,247 stops. The stops that were
added from the operator's GTFS feed never went through that pass, so they
have coordinates but no street. Photon resolves one coordinate at a time and
is accurate for Jakarta (an 8/8 match on stops that already had a street).

The run is resumable: every answer is cached in data/enrichment/streets.json,
so an interrupted pass continues where it stopped. It never overwrites a
street that the OSM relation already provided; it only fills the gap and
records that the value came from Photon.

Usage: python3 research/tools/geo/street-fill.py [--limit N]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SNAPSHOT = os.path.join(ROOT, "data/transit-network.json")
CACHE = os.path.join(ROOT, "data/enrichment/streets.json")
ENDPOINT = "https://photon.komoot.io/reverse"
WORKERS = 4
RETRIES = 3


def reverse(latitude: float, longitude: float) -> dict | None:
    url = f"{ENDPOINT}?lat={latitude}&lon={longitude}&lang=en&limit=1"
    request = urllib.request.Request(
        url, headers={"User-Agent": "daily-route/0.1 (street enrichment)"}
    )
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = json.load(response)
            features = payload.get("features") or []
            if not features:
                return {}
            properties = features[0].get("properties") or {}
            return {
                "street": properties.get("street"),
                "district": properties.get("district"),
                "city": properties.get("city"),
            }
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(1.5 * (attempt + 1))
    return None


def load_cache() -> dict:
    try:
        with open(CACHE, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    temporary = f"{CACHE}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(cache, handle, ensure_ascii=False)
    os.replace(temporary, CACHE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="stop after N lookups")
    args = parser.parse_args()

    with open(SNAPSHOT, encoding="utf-8") as handle:
        snapshot = json.load(handle)
    stations = snapshot["stations"]
    missing = [s for s in stations if not (s.get("metadata") or {}).get("street")]
    cache = load_cache()

    todo = [s for s in missing if s["id"] not in cache]
    if args.limit:
        todo = todo[: args.limit]
    print(
        f"· {len(missing)} stops without a street, {len(cache)} cached, "
        f"{len(todo)} to look up"
    )

    filled = 0
    start = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for station, result in zip(
            todo, pool.map(lambda s: reverse(s["latitude"], s["longitude"]), todo)
        ):
            if result is None:
                continue
            cache[station["id"]] = result
            if len(cache) % 100 == 0:
                save_cache(cache)
                print(f"  {len(cache)} cached, {round(time.time() - start)}s")

    for station in stations:
        if (station.get("metadata") or {}).get("street"):
            continue
        result = cache.get(station["id"]) or {}
        street = result.get("street")
        if not street:
            continue
        metadata = station.setdefault("metadata", {})
        metadata["street"] = street
        metadata["streetSource"] = "photon"
        if result.get("district"):
            metadata["streetDistrict"] = result["district"]
        filled += 1

    save_cache(cache)
    with open(SNAPSHOT, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    with_street = sum(
        1 for s in stations if (s.get("metadata") or {}).get("street")
    )
    print(f"✓ filled {filled}; {with_street}/{len(stations)} stops now have a street")


if __name__ == "__main__":
    sys.exit(main())
