# Simulations after the Jakarta Running Festival

Four cases were run against the live API, worker and database. The fixtures
were removed after each case; the active board was back to 23 notices.

## Screenshots

The app screenshots are in [`research/screenshots/index.html`](screenshots/index.html):
the clean board, an open route, a full closure, a one-direction closure in
both directions, a future window that stays off the board, and the chat
after the event. Fixtures are labelled; they were deleted after capture.

## 1. A closure in one direction only

A temporary stop notice closed Simpang Kuningan **only for the backward
direction of corridor 9**, with a `platforms` entry in its metadata.

| Journey | Verdict | Result |
|---|---|---|
| Grogol Reformasi → Simpang Kuningan (backward) | `routeBlocked: true` | Two alternatives; the direct ride is removed |
| Simpang Kuningan → Grogol Reformasi (forward) | `routeBlocked: false` | Corridor 7R runs normally |

The first full-closure run on 25 October produced a 9→5N itinerary:
corridor 9 ran past Simpang to Pancoran, 5N doubled back to Lintas Atas
Kuningan Mampang, and a 2-minute walk finished at Simpang. That is
operationally possible (the 9 vehicle passes a closed stop without
alighting; 5N really runs Pancoran→Lintas Atas), but it was not the best
option. `pickAccess` only planned against the three nearest stops, so it
never saw Tegal Parang, one corridor-9 stop after Simpang and 310 m from
it. The ring is now 8 stops within 1.2 km; the same closure returns 48
minutes via Tegal Parang and a 4-minute walk, with no change.

The first run exposed three bugs:

- `NetworkCache` rebuilt `Disruption` without `scope`, `lineCodes`, `roads`,
  `direction`, `towards` or `platforms`, so the direction-aware matcher never
  saw the platform entry. The cache now carries every field.
- `closedStopIds()` treated a platform-scoped notice as closing the whole
  station, so the direction that still ran was moved to a walk. It now skips
  platform-scoped notices and lets `matchDisruptions()` decide per leg.
- The notice board listed a notice whose window starts tomorrow. It now
  filters with `isActiveAt()`, the same test the planner uses.
- The API marked the journey `routeBlocked` but still returned the closed
  direct itinerary in `itineraries`; the UI then drew it as an open 41-minute
  ride. When the primary is blocked, the API now returns the alternatives
  and leaves the closed ride out. The directional screenshot shows 9A at
  42 minutes, while the opposite direction shows 7R at 41 minutes.

## 1b. A skipped stop, and a toll diversion

A temporary notice said "route 6H is diverted via Tol JORR and does not
serve Halte Cilandak; the bus passes the stop without stopping." The
assistant answered that 6H is still operating, Cilandak is skipped, the bus
passes without stopping, and the notice does not close the corridor. It
also said the toll is JORR, not the inner ring road, and offered to plan
from the nearest served stop. The fixture was deleted afterwards.

The general data is in `data/toll-roads.json` and `research/toll-roads.md`.
Toll usage is route-level, with `confirmed`, `reported` or `conditional`
confidence. Corridor 9 is beside the inner ring road, not on it by default.

## 2. A future window

A temporary closure with `starts_at` tomorrow and no `ends_at` was inserted.

- The plan for today stayed open (`routeBlocked: false`).
- The board did not contain the notice.
- The row stayed in `disruptions` for the future window.

This is the behaviour `isActiveAt()` is for: the board is what is in force
now, not every open row.

## 3. The last failed attempt

The worker test now inserts a fixture post, sets
`classification_attempts = 7`, makes the classifier throw, and ticks. The
post becomes `needs_review` instead of being dropped. The test is in
`apps/worker/src/monitor.test.ts`.

## 4. `TooManyConnections`

X allows one filtered-stream connection per App. The worker opens one and
reconnects with a backoff of up to 60 s.

The 429 was operational, not a poll: overlapping worker restarts, or a
second worker started by hand, can hold two connections until X releases
the old one. Two changes make that less likely:

- the stream starts **after** the HTTP port is bound; a second process now
  fails with `EADDRINUSE` and exits without opening a stream;
- SIGINT/SIGTERM aborts the stream, closes the HTTP server, flushes tracing
  and closes the database before exit.

Measured ledger rows show one connection per restart and no repeated
catch-up storm. The supervisor still retries a real 429 at 1, 2, 4 … 60 s.

## The usage ledger

`usage_events` (migration `0009_medical_blonde_phantom.sql`) has one row per
paid call:

- X: `endpoint`, `requests`, `posts`, `cost_usd` (estimated at $0.005 per
  Post read) and `latency_ms`; stream Posts and recent-search answers are
  separate operations.
- AI: `model`, `provider_name` (the endpoint OpenRouter actually used),
  `operation` (chat, classifier, grounder, verifier, research), prompt and
  completion tokens, the cost OpenRouter reported, and latency.

Example rows from the probe:

```
x  monitor     0 posts   $0.000000   268 ms
x  monitor     1 post    $0.005000
ai chat        Sail Research  4082 in / 51 out  $0.000058  2013 ms
ai classifier  Sail Research   ...             $0.000881  37053 ms
```

The table is intentionally not exposed by the API yet; the dashboard can
read it later.

## What is left

- The cheapest provider for the fixed model is **Sail Research** in these
  probes. It is cheap but the classifier took 37 s on one post. A quality
  and latency benchmark against the next provider is still open; the
  ledger now makes that comparison possible with real costs.
- The map was verified through the board API and the 20 e2e tests, not with
  a screenshot of the notice marker disappearing.
