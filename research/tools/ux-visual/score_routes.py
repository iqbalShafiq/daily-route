#!/usr/bin/env python3
"""Rank transit route candidates with weights you can change.

This is the tool behind the rules in ``research/google-maps-routing.md``
section 9. The point of the tool is that the weights are *arguments*, not
opinions baked into the code: every number below can be changed from the
command line, and the ranking can be read with the new weights before a
single line of the planner is touched.

The scoring model
-----------------

For every candidate (one candidate is one possible boarding stop, together
with the whole journey that starts there)::

    score = totalMinutes
          + w_transfer       * transferCount
          + w_walkPerKm      * walkingKm
          + w_accessWalkPerKm * accessWalkKm
          + w_distancePerKm  * distanceKm

``totalMinutes`` is the door-to-door time of the whole journey: the walk to
the boarding stop, the wait for the first vehicle, the ride, every change of
vehicle with its wait, and the walk at the end. The waiting time is already
inside it -- see ``packages/transit/src/graph.ts``, where boarding a
different vehicle costs the average wait of that mode.

Why the weights are shaped this way (every claim is sourced in
``research/google-maps-routing.md``):

* ``w_transfer`` -- Google Maps offers ``FEWER_TRANSFERS`` next to
  ``LESS_WALKING`` as a separate routing preference
  (developers.google.com/maps/documentation/routes/reference/rest/v2/TransitPreferences),
  so a change of vehicle is a criterion a rider may weigh, not a constant.
  The default of 3 minutes is the value the planner already uses as
  ``DEFAULT_TRANSFER_PENALTY_MINUTES``.
* ``w_walkPerKm`` -- walking time is already counted in ``totalMinutes``;
  this is a small premium on top of it, for heat and rain.
* ``w_accessWalkPerKm`` -- the walk to the *first* stop is worth more than
  the walk in the middle of the journey: the rider does not know the stop
  yet and may arrive late. It is the weight that makes a stop slightly
  further away win when the ride is much faster.
* ``w_distancePerKm`` -- 0.4 minutes per kilometre is the value the planner
  already uses as ``DISTANCE_WEIGHT_MINUTES_PER_KM``.

Google does not publish its own weights, and neither does this script pretend
to. The defaults are the Daily Route team's starting values, not Google's.

Input
-----

JSON on stdin, either a bare list of candidates or an object with a
``candidates`` list and an optional ``weights`` object::

    {
      "candidates": [
        {
          "stationId": "transjakarta:bsd",
          "stationName": "Bundaran Senayan",
          "totalMinutes": 54.0,
          "transferCount": 0,
          "walkingKm": 1.05,
          "accessWalkKm": 0.98,
          "distanceKm": 13.7
        }
      ],
      "weights": { "transfer": 3 }
    }

Accepted field names (the first one that is present wins):

  total duration   totalMinutes | total_duration_minutes | durationMinutes
  changes          transferCount | transfers | transfer_count
  total walking    walkingKm | walking_km | walkDistanceKm
  access walking   accessWalkKm | access_walk_km | walkDistanceKm
  journey distance distanceKm | distance_km

Usage
-----

    python3 research/tools/ux-visual/score_routes.py < candidates.json
    python3 research/tools/ux-visual/score_routes.py --example
    python3 research/tools/ux-visual/score_routes.py --profile fewer-transfers ...
    python3 research/tools/ux-visual/score_routes.py --weight-transfer 8 ...
    python3 research/tools/ux-visual/score_routes.py --json ...

Nothing outside the Python standard library is used.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

# --------------------------------------------------------------------------
# Weights
# --------------------------------------------------------------------------

DEFAULT_WEIGHTS: dict[str, float] = {
    # Minutes added per change of vehicle.
    "transfer": 3.0,
    # Minutes added per kilometre walked anywhere in the journey.
    "walkPerKm": 1.0,
    # Minutes added per kilometre of the walk to the first stop.
    "accessWalkPerKm": 2.0,
    # Minutes added per kilometre of the whole journey.
    "distancePerKm": 0.4,
}

# Named weight sets. They exist so the three answers a rider can ask for are
# one flag apart, the way Google's own routing preferences are.
PROFILES: dict[str, dict[str, float]] = {
    # The default answer: the journey that arrives soonest.
    "fastest": dict(DEFAULT_WEIGHTS),
    # Fewer changes of vehicle, even when it takes a little longer.
    "fewer-transfers": {**DEFAULT_WEIGHTS, "transfer": 8.0},
    # Prefer to walk less, even when it takes a little longer.
    "less-walking": {**DEFAULT_WEIGHTS, "walkPerKm": 4.0, "accessWalkPerKm": 4.0},
}

WEIGHT_FLAGS = {
    "transfer": "--weight-transfer",
    "walkPerKm": "--weight-walk-per-km",
    "accessWalkPerKm": "--weight-access-walk-per-km",
    "distancePerKm": "--weight-distance-per-km",
}

EXAMPLE_FILE = pathlib.Path(__file__).resolve().parent / "examples" / "origin-candidates.tanah-abang.json"

# --------------------------------------------------------------------------
# Reading candidates
# --------------------------------------------------------------------------

TOTAL_FIELDS = ("totalMinutes", "total_duration_minutes", "durationMinutes")
TRANSFER_FIELDS = ("transferCount", "transfers", "transfer_count")
WALKING_FIELDS = ("walkingKm", "walking_km", "walkDistanceKm")
ACCESS_FIELDS = ("accessWalkKm", "access_walk_km", "walkDistanceKm")
DISTANCE_FIELDS = ("distanceKm", "distance_km")


def first_number(source: dict[str, Any], fields: tuple[str, ...]) -> float | None:
    for field in fields:
        value = source.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None


def read_candidates(payload: Any) -> list[dict[str, Any]]:
    """Accept a bare list, or an object with a ``candidates`` list."""
    if isinstance(payload, dict):
        candidates = payload.get("candidates")
        if not isinstance(candidates, list):
            raise SystemExit("the input object has no 'candidates' list")
    elif isinstance(payload, list):
        candidates = payload
    else:
        raise SystemExit("the input must be a JSON list or an object with 'candidates'")

    cleaned: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            raise SystemExit(f"candidate {index} is not an object")
        total = first_number(candidate, TOTAL_FIELDS)
        if total is None:
            raise SystemExit(
                f"candidate {index} has no total duration "
                f"(expected one of: {', '.join(TOTAL_FIELDS)})"
            )
        cleaned.append(
            {
                "stationId": candidate.get("stationId") or candidate.get("station_id") or f"#{index}",
                "stationName": candidate.get("stationName")
                or candidate.get("station_name")
                or candidate.get("stationId")
                or f"#{index}",
                "systemId": candidate.get("systemId") or candidate.get("system_id") or "",
                "totalMinutes": total,
                "transferCount": first_number(candidate, TRANSFER_FIELDS) or 0.0,
                "walkingKm": first_number(candidate, WALKING_FIELDS) or 0.0,
                "accessWalkKm": first_number(candidate, ACCESS_FIELDS) or 0.0,
                "distanceKm": first_number(candidate, DISTANCE_FIELDS) or 0.0,
                "lines": candidate.get("lines") or [],
            }
        )
    if not cleaned:
        raise SystemExit("there are no candidates to rank")
    return cleaned


def read_weights(
    payload: Any,
    overrides: dict[str, float],
    base: dict[str, float] | None = None,
) -> dict[str, float]:
    weights = dict(base if base is not None else DEFAULT_WEIGHTS)
    if isinstance(payload, dict) and isinstance(payload.get("weights"), dict):
        for key, value in payload["weights"].items():
            if key not in weights:
                continue
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                weights[key] = float(value)
    for key, value in overrides.items():
        weights[key] = value
    return weights


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------


def score(candidate: dict[str, Any], weights: dict[str, float]) -> tuple[float, dict[str, float]]:
    parts = {
        "time": candidate["totalMinutes"],
        "transfer": weights["transfer"] * candidate["transferCount"],
        "walk": weights["walkPerKm"] * candidate["walkingKm"],
        "accessWalk": weights["accessWalkPerKm"] * candidate["accessWalkKm"],
        "distance": weights["distancePerKm"] * candidate["distanceKm"],
    }
    return sum(parts.values()), parts


def rank(candidates: list[dict[str, Any]], weights: dict[str, float]) -> list[dict[str, Any]]:
    ranked = []
    for candidate in candidates:
        value, parts = score(candidate, weights)
        ranked.append({**candidate, "score": round(value, 2), "scoreParts": parts})
    # Ties break on the shorter journey, then on the name, so the output is
    # stable between runs.
    ranked.sort(key=lambda item: (item["score"], item["totalMinutes"], item["stationName"]))
    for position, item in enumerate(ranked, start=1):
        item["rank"] = position
    return ranked


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


def describe_weights(weights: dict[str, float]) -> str:
    return (
        f"transfer={weights['transfer']:g}  "
        f"walk/km={weights['walkPerKm']:g}  "
        f"access-walk/km={weights['accessWalkPerKm']:g}  "
        f"distance/km={weights['distancePerKm']:g}"
    )


def print_report(
    ranked: list[dict[str, Any]],
    weights: dict[str, float],
    profile: str,
    show_all: bool,
) -> None:
    winner = ranked[0]
    nearest = min(ranked, key=lambda item: item["accessWalkKm"])
    print(f"profile: {profile}")
    print(f"weights: {describe_weights(weights)}")
    print()
    header = f"{'#':>2}  {'halte':<34} {'skor':>7} {'total':>6} {'pindah':>6} {'jalan':>6} {'akses':>6}"
    print(header)
    print("-" * len(header))
    shown = ranked if show_all else ranked[:12]
    for item in shown:
        marker = "  <-" if item is winner else ""
        print(
            f"{item['rank']:>2}  {item['stationName'][:34]:<34} "
            f"{item['score']:>7.1f} {item['totalMinutes']:>6.1f} "
            f"{int(item['transferCount']):>6} {item['walkingKm']:>6.2f} "
            f"{item['accessWalkKm']:>6.2f}{marker}"
        )
    if not show_all and len(ranked) > len(shown):
        print(f"... ({len(ranked) - len(shown)} kandidat lain, pakai --all untuk melihat semua)")
    print()

    print(f"pemenang : {winner['stationName']} ({winner['systemId'] or 'tanpa sistem'})")
    print(
        f"           total {winner['totalMinutes']:.0f} menit, "
        f"{int(winner['transferCount'])} pindah, "
        f"jalan {winner['walkingKm']:.2f} km (akses {winner['accessWalkKm']:.2f} km)"
    )
    breakdown = winner["scoreParts"]
    print(
        "           skor = "
        f"{breakdown['time']:.1f} (waktu)"
        f" + {breakdown['transfer']:.1f} (pindah)"
        f" + {breakdown['walk']:.1f} (jalan)"
        f" + {breakdown['accessWalk']:.1f} (jalan akses)"
        f" + {breakdown['distance']:.1f} (jarak) = {winner['score']:.1f}"
    )

    if nearest is not winner:
        gain = nearest["totalMinutes"] - winner["totalMinutes"]
        extra_walk = winner["accessWalkKm"] - nearest["accessWalkKm"]
        print()
        print(
            f"catatan  : halte terdekat adalah {nearest['stationName']} "
            f"({nearest['accessWalkKm']:.2f} km, {nearest['totalMinutes']:.0f} menit, "
            f"{int(nearest['transferCount'])} pindah)"
        )
        print(
            f"          Memakai {nearest['stationName']} butuh "
            f"{gain:+.0f} menit "
            f"({extra_walk:+.2f} km jalan akses)"
            f" dan {int(nearest['transferCount']) - int(winner['transferCount']):+d} pindah"
        )


def print_json(ranked: list[dict[str, Any]], weights: dict[str, float], profile: str) -> None:
    payload = {
        "profile": profile,
        "weights": weights,
        "ranking": [
            {
                "rank": item["rank"],
                "stationId": item["stationId"],
                "stationName": item["stationName"],
                "systemId": item["systemId"],
                "score": item["score"],
                "scoreParts": {key: round(value, 2) for key, value in item["scoreParts"].items()},
                "totalMinutes": item["totalMinutes"],
                "transferCount": item["transferCount"],
                "walkingKm": item["walkingKm"],
                "accessWalkKm": item["accessWalkKm"],
                "distanceKm": item["distanceKm"],
                "lines": item["lines"],
            }
            for item in ranked
        ],
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILES),
        default="fastest",
        help="named weight set (default: fastest)",
    )
    parser.add_argument(
        "--weight-transfer",
        type=float,
        help="minutes added per change of vehicle",
    )
    parser.add_argument(
        "--weight-walk-per-km",
        type=float,
        help="minutes added per kilometre walked anywhere",
    )
    parser.add_argument(
        "--weight-access-walk-per-km",
        type=float,
        help="minutes added per kilometre of the walk to the first stop",
    )
    parser.add_argument(
        "--weight-distance-per-km",
        type=float,
        help="minutes added per kilometre of the whole journey",
    )
    parser.add_argument(
        "--example",
        action="store_true",
        help=f"score the built-in example ({EXAMPLE_FILE.name}) instead of stdin",
    )
    parser.add_argument(
        "--example-file",
        type=pathlib.Path,
        help="score this example file instead of stdin",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="print every candidate, not only the first twelve",
    )
    parser.add_argument("--json", action="store_true", help="print the ranking as JSON")
    args = parser.parse_args()

    weights = dict(PROFILES[args.profile])
    overrides = {
        "transfer": args.weight_transfer,
        "walkPerKm": args.weight_walk_per_km,
        "accessWalkPerKm": args.weight_access_walk_per_km,
        "distancePerKm": args.weight_distance_per_km,
    }
    overrides = {key: value for key, value in overrides.items() if value is not None}
    for key, value in overrides.items():
        weights[key] = value

    if args.example_file is not None:
        source = args.example_file
        if not source.exists():
            raise SystemExit(f"example file not found: {source}")
        payload = json.loads(source.read_text(encoding="utf-8"))
    elif args.example:
        if not EXAMPLE_FILE.exists():
            raise SystemExit(
                f"example file not found: {EXAMPLE_FILE}\n"
                "regenerate it with: python3 research/tools/ux-visual/make_origin_example.py --all"
            )
        payload = json.loads(EXAMPLE_FILE.read_text(encoding="utf-8"))
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            raise SystemExit("no input on stdin; pass --example to score the built-in example")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"stdin is not valid JSON: {error}") from error

    weights = read_weights(payload, overrides, base=weights)
    candidates = read_candidates(payload)
    ranked = rank(candidates, weights)

    if args.json:
        print_json(ranked, weights, args.profile)
    else:
        print_report(ranked, weights, args.profile, args.all)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
