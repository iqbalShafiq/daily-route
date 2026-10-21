#!/usr/bin/env python3
"""Periksasnapshot jaringan transit untuk hal-hal yang harus benar.

Audit ini tidak consulting internet: ia memeriksa hal-hal yang bisa
dibuktikan dari data itu sendiri, sehingga regresi langsung terlihat.

Pemakaian:
    python3 research/tools/audit-network.py
"""

from __future__ import annotations

import collections
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SNAPSHOT = REPO / "data" / "transit-network.json"
OFFICIAL = REPO / "research" / "data" / "transjakarta-routes.json"

# Batas Jakarta dan sekitarnya, beserta kota在旁边 yang dilayani.
BOUNDS = {"minLat": -7.05, "maxLat": -5.85, "minLon": 106.2, "maxLon": 107.55}


def main() -> int:
    snapshot = json.loads(SNAPSHOT.read_text())
    lines = snapshot["lines"]
    stations = {station["id"]: station for station in snapshot["stations"]}
    stops = snapshot["lineStops"]
    groups = snapshot.get("stationGroups", [])
    geometries = snapshot.get("lineGeometries", [])

    problems: list[str] = []

    # 1. every stop points at a station that exists -----------------------
    unknown = {stop["stationId"] for stop in stops} - set(stations)
    if unknown:
        problems.append(f"{len(unknown)} halte pada line_stops tidak ada di tabel stations")

    # 2. every station is used by some line ------------------------------
    used = {stop["stationId"] for stop in stops}
    orphans = {sid for sid in stations if sid not in used}
    if orphans:
        problems.append(f"{len(orphans)} stasiun tidak dipakai oleh line mana pun")

    # 3. the coordinates are inside the region ---------------------------
    outside = [
        station
        for station in stations.values()
        if not (
            BOUNDS["minLat"] <= station["latitude"] <= BOUNDS["maxLat"]
            and BOUNDS["minLon"] <= station["longitude"] <= BOUNDS["maxLon"]
        )
    ]
    if outside:
        sample = ", ".join(f"{s['name']} ({s['latitude']:.4f},{s['longitude']:.4f})" for s in outside[:5])
        problems.append(f"{len(outside)} stasiun di luar batas Jabodetabek: {sample}")

    # 4. a line has at least two stops in every direction ----------------
    per_line = collections.Counter((stop["lineId"], stop["direction"]) for stop in stops)
    thin = [f"{lineId}/{direction}" for (lineId, direction), count in per_line.items() if count < 2]
    if thin:
        problems.append(f"{len(thin)} arah rute punya kurang dari dua halte: {thin[:5]}")

    # 5. the positions of a direction run from one to n -------------------
    by_direction: dict[tuple[str, str], list[int]] = collections.defaultdict(list)
    for stop in stops:
        by_direction[(stop["lineId"], stop["direction"])].append(stop["position"])
    broken = []
    for key, positions in by_direction.items():
        ordered = sorted(positions)
        if ordered != list(range(1, len(ordered) + 1)):
            broken.append(key)
    if broken:
        problems.append(f"{len(broken)} arah rute punya nomor urut yang bolong: {broken[:5]}")

    # 6. the geometry of a line covers its stops -------------------------
    geometry_by_line = collections.defaultdict(list)
    for geometry in geometries:
        geometry_by_line[(geometry["lineId"], geometry["direction"])].append(geometry)
    for key, entries in geometry_by_line.items():
        if len(entries) > 1:
            problems.append(f"{key} punya {len(entries)} geometri, seharusnya satu")

    # 7. the hub members are all stations of the same region -------------
    for group in groups:
        group_members = group.get("stationIds", [])
        if len(group_members) < 2:
            problems.append(f"hub {group.get('name')} punya {len(group_members)} anggota")
            continue
        points = [(stations[sid]["latitude"], stations[sid]["longitude"]) for sid in group_members if sid in stations]
        if points:
            spread = max(
                ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 * 111 for a in points for b in points
            )
            if spread > 0.7:
                problems.append(
                    f"hub {group.get('name')} tersebar {spread:.2f} km, seharusnya bisa dilewati kaki"
                )

    # 8. the official corridors -----------------------------------------
    if OFFICIAL.exists():
        official = json.loads(OFFICIAL.read_text())["corridors"]
        app_codes = {
            line["code"].replace(".", "").upper()
            for line in lines
            if line["systemId"] == "transjakarta"
        }
        missing = sorted(
            corridor["code"] for corridor in official if corridor["code"] not in app_codes
        )
        if missing:
            problems.append(
                f"{len(missing)} koridor resmi belum ada di data: {', '.join(missing)}"
            )
        official_class = {corridor["code"]: corridor["service"] for corridor in official}
        wrong = [
            f"{line['code']}={line['serviceClass']} (resmi {official_class[line['code'].replace('.', '').upper()]})"
            for line in lines
            if line["systemId"] == "transjakarta"
            and line["code"].replace(".", "").upper() in official_class
            and line["serviceClass"] != official_class[line["code"].replace(".", "").upper()]
            and line["serviceClass"] != "minitrans"
        ]
        if wrong:
            problems.append(f"{len(wrong)} koridor salah kelas layanan: {', '.join(wrong[:8])}")

    # 9. every class has a tariff ---------------------------------------
    fares = json.loads((REPO / "research" / "data" / "fares.json").read_text())
    known = set(fares["modes"])
    used_classes = {line["serviceClass"] for line in lines}
    missing_fare = sorted(
        cls
        for cls in used_classes
        if cls
        not in ("brt", "non-brt", "minitrans", "mikrotrans", "royaltrans", "wisata", "rumah-susun", "transjabodetabek", "amari", "rapid-transit", "lrt", "commuter-rail")
    )
    if missing_fare:
        problems.append(f"kelas layanan tanpa tarif: {missing_fare}")
    if not known:
        problems.append("tidak ada aturan tarif di fares.json")

    print(f"lines {len(lines)} · stations {len(stations)} · stops {len(stops)} · hubs {len(groups)}")
    if problems:
        print("\nMASALAH:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("\ntidak ada masalah yang ditemukan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
