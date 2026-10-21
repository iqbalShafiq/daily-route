#!/usr/bin/env python3
"""Build a real origin-candidate example from the committed network snapshot.

The example that ``score_routes.py`` scores is not hand-written. It is
produced here from ``data/transit-network.json`` so that every number in it
can be traced back to the same data the planner uses.

The planning arithmetic below is a faithful port of
``packages/transit/src/graph.ts``:

  * a ride edge between two consecutive stops of a line is measured along the
    line (the published ``distanceFromOriginKm``), and costs
    ``distance / average speed * 60 + dwell``;
  * boarding a different vehicle costs the average wait of that mode;
  * walking between two stations of the same interchange costs
    ``max(2 minutes, walk at 4.5 km/h)`` and counts as one change of vehicle;
  * the search is A* over ``time + 0.4 * km + 3 * changes + waits``.

One thing is NOT the same as production: the walk from the rider's position
to the boarding stop is a straight line multiplied by the detour factor
(1.25), because this script has no pedestrian router. Production asks OSRM
for the real footpath (``apps/api/src/routes/walk.ts``). The example says so,
in every candidate, in the ``walkDistanceSource`` field.

Usage:

    python3 research/tools/ux-visual/make_origin_example.py
    python3 research/tools/ux-visual/make_origin_example.py --out path.json
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import pathlib
import sys

# --------------------------------------------------------------------------
# Constants mirrored from packages/transit/src/graph.ts
# --------------------------------------------------------------------------

AVERAGE_SPEED_KMH = {"bus": 18, "minibus": 21, "tram": 26, "metro": 29, "rail": 38}
AVERAGE_WAIT_MINUTES = {"bus": 5, "minibus": 4, "tram": 6, "metro": 3, "rail": 6}
DWELL_MINUTES = 0.6
MIN_TRANSFER_MINUTES = 2
TRANSFER_PENALTY_MINUTES = 3
DISTANCE_WEIGHT_MINUTES_PER_KM = 0.4
HEURISTIC_SPEED_KMH = 45
DETOUR_FACTOR = 1.25
WALK_SPEED_KMH = 4.5

# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    d_lat = lat2 - lat1
    d_lon = math.radians(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def walking_minutes(distance_km: float) -> int:
    return round((distance_km / WALK_SPEED_KMH) * 60)


# --------------------------------------------------------------------------
# Graph
# --------------------------------------------------------------------------


class Graph:
    """The searchable network, built the way the planner builds it."""

    def __init__(self, network: dict) -> None:
        self.stations = {s["id"]: s for s in network["stations"]}
        self.lines = {line["id"]: line for line in network["lines"]}
        self.adjacency: dict[str, list[dict]] = {}

        stops_by_line: dict[str, dict[str, list[dict]]] = {}
        for stop in network["lineStops"]:
            entry = stops_by_line.setdefault(stop["lineId"], {"forward": [], "backward": []})
            entry[stop["direction"]].append(stop)
        for entry in stops_by_line.values():
            entry["forward"].sort(key=lambda s: s["position"])
            entry["backward"].sort(key=lambda s: s["position"])

        for line_id, stops in stops_by_line.items():
            line = self.lines.get(line_id)
            if not line or line.get("status") != "operating":
                continue
            forward = stops["forward"]
            backward = stops["backward"] or list(reversed(forward))
            if len(forward) < 2:
                continue
            self._connect(forward, line, "forward")
            self._connect(backward, line, "backward")

        for group in network["stationGroups"]:
            members = [self.stations[s] for s in group["stationIds"] if s in self.stations]
            for origin in members:
                for target in members:
                    if origin["id"] == target["id"]:
                        continue
                    distance = haversine_km(
                        (origin["latitude"], origin["longitude"]),
                        (target["latitude"], target["longitude"]),
                    )
                    self._push(
                        {
                            "kind": "walk",
                            "from": origin["id"],
                            "to": target["id"],
                            "durationMinutes": max(MIN_TRANSFER_MINUTES, walking_minutes(distance)),
                            "distanceKm": distance,
                            "lineId": None,
                            "mode": None,
                        }
                    )

    def _push(self, edge: dict) -> None:
        self.adjacency.setdefault(edge["from"], []).append(edge)

    def _connect(self, stops: list[dict], line: dict, direction: str) -> None:
        speed = AVERAGE_SPEED_KMH[line["mode"]]
        for index in range(len(stops) - 1):
            current, following = stops[index], stops[index + 1]
            origin = self.stations.get(current["stationId"])
            target = self.stations.get(following["stationId"])
            if not origin or not target:
                continue
            distance = self._segment_distance(origin, target, current, following)
            ride = (distance / speed) * 60
            self._push(
                {
                    "kind": "ride",
                    "from": origin["id"],
                    "to": target["id"],
                    "durationMinutes": max(1.0, ride + DWELL_MINUTES),
                    "distanceKm": distance,
                    "lineId": line["id"],
                    "mode": line["mode"],
                    "direction": direction,
                }
            )

    @staticmethod
    def _segment_distance(origin: dict, target: dict, current: dict, following: dict) -> float:
        here = current.get("distanceFromOriginKm")
        there = following.get("distanceFromOriginKm")
        if isinstance(here, (int, float)) and isinstance(there, (int, float)):
            delta = abs(there - here)
            if delta > 0:
                return float(delta)
        return haversine_km(
            (origin["latitude"], origin["longitude"]),
            (target["latitude"], target["longitude"]),
        ) * DETOUR_FACTOR

    # -- search ------------------------------------------------------------

    def search(self, origin_id: str, destination_id: str) -> dict | None:
        """A* over the same cost model the planner uses."""
        origin = self.stations.get(origin_id)
        destination = self.stations.get(destination_id)
        if not origin or not destination:
            return None
        if origin_id == destination_id:
            return {"stationIds": [origin_id], "legs": []}

        def heuristic(station: dict) -> float:
            straight = haversine_km(
                (station["latitude"], station["longitude"]),
                (destination["latitude"], destination["longitude"]),
            )
            return (straight / HEURISTIC_SPEED_KMH) * 60

        best_cost: dict[str, float] = {origin_id: 0.0}
        best_path: dict[str, dict] = {origin_id: {"previous": None, "edge": None}}
        transfers: dict[str, int] = {origin_id: 0}
        ridden: dict[str, bool] = {origin_id: False}
        current_line: dict[str, str | None] = {origin_id: None}

        queue: list[tuple[float, float, str]] = [(heuristic(origin), 0.0, origin_id)]
        while queue:
            _, cost, node = heapq.heappop(queue)
            known = best_cost.get(node)
            if known is not None and cost > known:
                continue
            if node == destination_id:
                return self._reconstruct(best_path, destination_id)
            for edge in self.adjacency.get(node, []):
                is_walk = edge["kind"] == "walk"
                has_ridden = ridden.get(node, False)
                used = transfers.get(node, 0)
                next_transfers = used + 1 if (is_walk and has_ridden) else used
                transfer_penalty = TRANSFER_PENALTY_MINUTES if (is_walk and has_ridden) else 0.0
                boarded = edge["kind"] == "ride" and edge["lineId"] != current_line.get(node)
                wait = AVERAGE_WAIT_MINUTES.get(edge["mode"], 0) if boarded else 0
                total = (
                    cost
                    + edge["durationMinutes"]
                    + edge["distanceKm"] * DISTANCE_WEIGHT_MINUTES_PER_KM
                    + transfer_penalty
                    + wait
                )
                known_cost = best_cost.get(edge["to"])
                if known_cost is not None and total >= known_cost:
                    continue
                best_cost[edge["to"]] = total
                best_path[edge["to"]] = {"previous": node, "edge": edge}
                transfers[edge["to"]] = next_transfers
                ridden[edge["to"]] = has_ridden or edge["kind"] == "ride"
                current_line[edge["to"]] = edge["lineId"] if edge["kind"] == "ride" else None
                station = self.stations.get(edge["to"])
                if not station:
                    continue
                heapq.heappush(queue, (total + heuristic(station), total, edge["to"]))
        return None

    @staticmethod
    def _reconstruct(path: dict[str, dict], destination_id: str) -> dict:
        station_ids: list[str] = []
        legs: list[dict] = []
        cursor: str | None = destination_id
        while cursor is not None:
            station_ids.append(cursor)
            info = path.get(cursor)
            if not info:
                break
            if info["edge"]:
                legs.append(info["edge"])
            cursor = info["previous"]
        station_ids.reverse()
        legs.reverse()
        return {"stationIds": station_ids, "legs": legs}


# --------------------------------------------------------------------------
# Itinerary summary
# --------------------------------------------------------------------------


def summarise(graph: Graph, result: dict) -> dict:
    """Turn a search result into the numbers a rider cares about.

    This mirrors ``toItinerary`` in ``packages/transit/src/graph.ts``: the
    duration is the sum of the leg durations, every ride leg that does not
    continue the one before it carries the average wait of its mode, and a
    change of vehicle is counted when two consecutive rides are on different
    lines. The three-minute transfer penalty is *not* part of the duration;
    in the planner it only enters the cost.
    """
    legs = result["legs"]
    duration = 0.0
    distance = 0.0
    walking = 0.0
    wait = 0.0
    current_line: str | None = None
    previous_ride_line: str | None = None
    changes = 0
    lines: list[str] = []
    for edge in legs:
        duration += edge["durationMinutes"]
        distance += edge["distanceKm"]
        if edge["kind"] == "walk":
            walking += edge["distanceKm"]
            current_line = None
            continue
        if edge["lineId"] != current_line:
            # The rider has to wait for this vehicle.
            wait += AVERAGE_WAIT_MINUTES.get(edge["mode"], 0)
            current_line = edge["lineId"]
            if edge["lineId"] != previous_ride_line:
                if previous_ride_line is not None:
                    changes += 1
                lines.append(edge["lineId"])
                previous_ride_line = edge["lineId"]
    return {
        "durationMinutes": round(duration + wait, 1),
        "transferCount": changes,
        "distanceKm": round(distance, 2),
        "walkingKm": round(walking, 2),
        "waitMinutes": round(wait, 1),
        "lines": lines,
        "stationIds": result["stationIds"],
    }


# --------------------------------------------------------------------------
# The examples
# --------------------------------------------------------------------------

CANDIDATE_RADIUS_KM = 1.2
MAX_CANDIDATES = 200

# Two scenarios, both taken from the committed network.
#
# 1. Tanah Abang -> Lebak Bulus (MRT, ujung selatan Lin NS). The nearest
#    stop is a local Transjakarta stop that needs six changes; a KRL stop
#    780 m away reaches the same place with none. This is the case that
#    proves "nearest stop" is the wrong rule.
#
# 2. Bendungan Hilir -> Tomang (MRT). Here the profiles disagree about the
#    *boarding stop*: the quickest journey starts at Plaza Sentral and needs
#    a walk, the journey with the fewest changes starts at the stop where
#    the rider already stands and walks into the MRT station instead.
# The rider's position is the position of a real station in the snapshot, so
# that no coordinate in this script comes from a memory. A rider standing at
# a stop is the hardest case for the "nearest stop" rule: the stop is right
# there, and it is still the wrong one.
SCENARIOS: dict[str, dict] = {
    "tanah-abang": {
        "file": "origin-candidates.tanah-abang.json",
        "userStationId": "transjakarta:st-karet",
        "destinationId": "mrt-jakarta:lebak-bulus-bank-syariah-indonesia",
    },
    "bendungan-hilir": {
        "file": "origin-candidates.bendungan-hilir.json",
        "userStationId": "transjakarta:bendungan-hilir",
        "destinationId": "mrt-jakarta:tomang",
    },
}


def build_example(network_path: pathlib.Path, scenario: dict) -> dict:
    network = json.loads(network_path.read_text(encoding="utf-8"))
    graph = Graph(network)

    destination_id = scenario["destinationId"]
    destination = graph.stations.get(destination_id)
    if not destination:
        raise SystemExit(f"destination {destination_id} is not in the network")

    origin_station = graph.stations.get(scenario["userStationId"])
    if not origin_station:
        raise SystemExit(f"user station {scenario['userStationId']} is not in the network")
    user_position = (origin_station["latitude"], origin_station["longitude"])

    nearby = []
    for station in network["stations"]:
        distance = haversine_km(
            (station["latitude"], station["longitude"]),
            user_position,
        )
        if distance <= CANDIDATE_RADIUS_KM:
            nearby.append((distance, station))
    nearby.sort(key=lambda item: item[0])

    candidates = []
    for distance, station in nearby[:MAX_CANDIDATES]:
        result = graph.search(station["id"], destination_id)
        if not result:
            continue
        summary = summarise(graph, result)
        # The walk is a straight line with the detour factor. Production uses
        # the pedestrian router; the field says so.
        walk_km = round(distance * DETOUR_FACTOR, 3)
        walk_minutes = max(1, walking_minutes(walk_km))
        candidates.append(
            {
                "stationId": station["id"],
                "stationName": station["name"],
                "systemId": station["systemId"],
                "straightDistanceKm": round(distance, 3),
                "walkDistanceKm": walk_km,
                "walkDurationMinutes": walk_minutes,
                "walkDistanceSource": "straight-line x 1.25 detour factor (proxy)",
                "totalMinutes": round(summary["durationMinutes"] + walk_minutes, 1),
                "transferCount": summary["transferCount"],
                "distanceKm": summary["distanceKm"],
                "walkingKm": round(summary["walkingKm"] + walk_km, 2),
                "waitMinutes": summary["waitMinutes"],
                "lines": summary["lines"],
            }
        )

    return {
        "meta": {
            "source": "data/transit-network.json",
            "userPosition": {"latitude": user_position[0], "longitude": user_position[1]},
            "userPlace": f"berdiri di halte {origin_station['name']} ({origin_station['systemId']})",
            "destination": {
                "stationId": destination_id,
                "name": destination["name"],
                "systemId": destination["systemId"],
            },
            "candidateRadiusKm": CANDIDATE_RADIUS_KM,
            "note": (
                "Durasi dan jarak kendaraan dihitung dengan aritmetika yang sama "
                "dengan packages/transit/src/graph.ts (kecepatan rata-rata per mode, "
                "dwell 0,6 menit, waktu tunggu rata-rata per mode, penalti 3 menit "
                "per pindah). Jarak jalan kaki adalah jarak lurus x 1,25, bukan rute kaki "
                "OSRM."
            ),
            "generator": "research/tools/ux-visual/make_origin_example.py",
        },
        "candidates": candidates,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--network",
        default="data/transit-network.json",
        help="path to the network snapshot",
    )
    parser.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS),
        default="tanah-abang",
        help="which scenario to build",
    )
    parser.add_argument(
        "--out",
        default="-",
        help="where to write the example JSON ('-' is stdout)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="write every scenario into the examples directory",
    )
    args = parser.parse_args()

    network_path = pathlib.Path(args.network)
    if not network_path.exists():
        raise SystemExit(f"network snapshot not found: {network_path}")

    examples_dir = pathlib.Path(__file__).resolve().parent / "examples"

    if args.all:
        for name, scenario in SCENARIOS.items():
            example = build_example(network_path, scenario)
            target = examples_dir / scenario["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(
                json.dumps(example, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            print(f"wrote {target}", file=sys.stderr)
        return 0

    example = build_example(network_path, SCENARIOS[args.scenario])
    text = json.dumps(example, indent=2, ensure_ascii=False) + "\n"
    if args.out == "-":
        sys.stdout.write(text)
    else:
        pathlib.Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
