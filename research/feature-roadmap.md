# What to build next

27 October 2026. A product/feature review after the route patterns, notices,
fares and chat work. The question is not "what else can a map do"; it is
"which missing piece would make a rider trust the answer more?"

## Where the product already is

- deterministic multimodal planning with alternatives, walking and fare
  quotes (including the JakLingko cap in `packages/transit/src/fare.ts`);
- line patterns, service days, skipped/extra stops and holiday handling;
- live operator notices, X/news sources and a chat assistant;
- saved places and recent journeys in the browser;
- no public realtime vehicle feed (see `realtime.md`), so the schedule is
  the honest source.

The biggest gap is **time**. The planner uses a fixed average wait per mode
(`AVERAGE_WAIT_MINUTES`: bus 5, minibus 4, tram 6, metro 3, rail 6 in
`packages/transit/src/graph.ts`). The GTFS feed has 753 frequency rows; 752
are headway-based (`exact_times=0`). The data is there; the planner does not
use it. The API's `at` only decides which service-day pattern runs, not the
departure time.

## What riders feel

The Jakarta-specific evidence points to waits and transfers, not distance:

- Riders are **2.4–4.2 times more sensitive to waiting** than to in-vehicle
  time; the pure transfer penalty is small once wait and travel are counted.
  Kreindler, Gaduh, Graff, Hanna & Olken, NBER Working Paper 31369:
  <https://www.nber.org/papers/w31369>; IGC's TransJakarta operational-quality
  study: <https://www.theigc.org/publications/impact-operational-quality-public-transportation-case-transjakarta-0>.
- A 2025 Kemanggisan station study documents long waits and overcrowding at
  peak: <https://iopscience.iop.org/article/10.1088/1755-1315/1564/1/012047>.
- Transjakarta serves 91.8% of the province within a 5–10 minute walk, yet
  public-transport mode share is about 22%; the gap is access quality and
  reliability, not network extent.
- Women are the majority of riders; safety and night travel are design
  constraints, not edge cases.

Those points make a timetable window more valuable than another colour on
the map.

## Five candidates

| # | Feature | Why it matters | Data | Effort | Verdict |
|---|---|---|---|---|---|
| 1 | **Time-aware plan: leave at / arrive by, headway windows** | The current fixed wait is the largest modelling error; it changes the chosen route | GTFS `frequencies.txt`, calendars, patterns | M | **Build first** |
| 2 | **Departure board at a stop** | "When is the next one?" is the platform question; no live feed needed | GTFS frequency + service day + pattern | S/M | **Build with #1** |
| 3 | **Watch this trip** | A saved journey plus notices that affect it; closes the loop after planning | existing notices + local storage; optional Web Push | M | **Build next** |
| 4 | **Fare-cap explainer / optimizer** | The engine already computes the JakLingko cap; riders do not see why one option is cheaper | existing `fare.ts` | S | **Polish** |
| 5 | **Step-free accessibility routing** | High need, but GTFS has no pathways/elevators and field data is unverified | missing | L + data ops | **Defer** |
| 6 | **Crowding forecast** | Valuable at peak, but no APC/occupancy feed | missing | L + partnership | **Defer** |
| 7 | **Night-safe first/last mile** | AMARI and last trains matter, but coverage/security data is incomplete | partial GTFS + safety data | L | **Research** |

## 1. Time-aware planning

### What to build

- Add `departAt` and `arriveBy` to the planner/API (the agent already has a
  `departAt` field).
- Load `frequencies.txt` into the network, keyed by route/direction and
  time window. Most rows are headway-based, so the wait is a **window**, not
  a fake exact departure.
- Use the window in A*: a line with a 4-minute headway is not the same as a
  line with a 25-minute headway, even when both are on the same road.
- In the result, print `every 8–12 min` and the expected wait, not a single
  invented minute.
- Keep the current average as a fallback when a frequency row is missing.

### Why first

Waiting dominates the perceived cost. The current fixed wait is especially
wrong for Mikrotrans and feeder routes, where headways are long and the
difference can change the chosen route. It needs no new provider, no
realtime access and no scraping.

### Risks

- GTFS `frequencies.txt` can have overlapping windows; pick the most
  specific and test `exact_times=1` separately (only one row in the current
  feed).
- A headway is not a promise. Label it "scheduled every …", never "bus at
  10:14".
- The API's current `at` is already used for service-day patterns; extend it
  rather than adding a second clock.

## 2. Stop departure board

The stop popover can answer "next departures" from the same headway model:
line, headsign, service day, next window, skipped-stop warning. This is a
small surface and a natural place to expose patterns without opening a full
journey.

## 3. Watch this trip

A rider should be able to save a journey and be told when a notice touches
its line, stop or direction. The existing notice model already has scope,
direction and validity windows. Start with an in-app "Watching" state and a
badge; Web Push is an optional second step. Do not add a notification for
every delay.

## 4. Fare-cap explainer

The fare engine already includes the JakLingko integration/cap. The UI should
say **why** a route is cheaper: cap, card requirement, or a non-covered
operator. This is a copy/UI task, not a new engine.

## 5. What not to build yet

- **Live bus map / ETA**: no public feed; see `realtime.md`. Do not fake it.
- **Step-free routing**: no GTFS pathways or elevator status; a wrong
  "accessible" answer is worse than no answer.
- **Crowding prediction**: no APC/occupancy data; a model would be a guess.
- **Safety heatmap**: sensitive personal data and a high false-positive
  cost; needs a partnership and a policy first.

## Recommended sequence

1. Time-aware planner + expected wait window.
2. Stop departure board from the same data.
3. Watch this trip.
4. Fare-cap explainer.
5. Revisit accessibility/crowding only with a data partner.

## Sources

- GTFS static feed: <https://gtfs.transjakarta.co.id/files/file_gtfs.zip>
- GTFS frequencies: <https://gtfs.org/schedule/reference/#frequenciestxt>
- Transjakarta realtime via Google Maps (11 Jul 2024):
  <https://transjakarta.co.id/news/real-time-transjakarta-information-now-available-on-google-maps>
- TJ app: <https://play.google.com/store/apps/details?id=com.transjakmobile>
- JakLingko cap explanation:
  <https://smartcity.jakarta.go.id/en/blog/03-2026-puas-jalan-jalan-hanya-rp10.000-dengan-sistem-jaklingko>
- GTFS accessibility fields:
  <https://gtfs.org/schedule/reference/#stoptxt>
- MRT accessibility:
  <https://www.jakartamrt.co.id/berita/mrt-jakarta-transportasi-publik-yang-ramah-bagi-penyandang-disabilitas>
- Transjakarta Cares:
  <https://transjakarta.co.id/services/transjakarta-cares>


## Status after this pass

- **Time-aware plan / headway windows** — implemented: GTFS
  `frequencies.txt` is attached to line metadata, the planner uses the
  scheduled wait, and each ride carries a frequency label and daily window.
- **Stop departure board** — implemented: `/api/stations/:id/departures`
  and the stop popover show scheduled lines and headways.
- **Watch this trip** — implemented locally: the planner keeps a watched
  journey across reloads and shows the state on the result. Web Push is not
  included.
- **Fare-cap explainer** — implemented as a note when a lower JakLingko
  alternative exists.
- **Night-safe planning** — implemented as service-window filtering plus a
  walking penalty and a Night-safe toggle. It prefers fewer night walks; it
  does not promise personal safety.
- **Semantic chat** — implemented; see `research/chat-ui.md`.
