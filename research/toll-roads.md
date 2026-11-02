# Toll roads, skipped stops, and the difference from a closure

25 October 2026. This is the data and the rule behind the answer "the bus
passes the stop without stopping".

## The distinction

A stop notice can mean three different things:

1. **The stop is closed.** A rider cannot board or alight there. The planner
   may walk to a nearby stop; a journey that only passes the stop is still
   open.
2. **The stop is skipped by a diversion.** The corridor still runs, but the
   vehicle leaves the ordinary road for a toll road, a flyover or another
   street and does not serve the stops on the skipped stretch. The stops are
   passed, not removed from the network.
3. **The corridor is closed.** A line or network notice. This is the only
   case that removes the way itself.

The planner already treats a stop on a ride leg as a **pass-through** unless
it is the boarding or alighting point (`matchDisruptions` and
`blocksJourney`). The API and the route tool now also carry `viaToll` when
the announcement says the diversion uses a toll road. The assistant says
"skipped, not closed", and plans from the nearest stop when the skipped stop
is the rider's origin or destination.

## The data

`data/toll-roads.json` has two parts:

- **roads**: Jagorawi, Tol Lingkar Dalam Jakarta, JORR, Jakarta–Cikampek,
  Jakarta–Merak, Prof. Sedyatmo (airport), Desari, and Ir. Wiyoto Wiyono,
  with their cities, gates and sources.
- **services**: the route codes that are known to use a toll, the roads, a
  confidence and a source. `confirmed` is an official route page or a news
  report; `reported` is a route listing; `conditional` means some trips or
  some diversions only.

Examples:

| Route | Toll | Confidence | Note |
|---|---|---|---|
| 6H Senen–Lebak Bulus | JORR | confirmed | the route table names "via Tol JORR" |
| 6P Kuningan–Cibubur | Jagorawi + Dalam Kota | confirmed | Kompas describes entering from Jagorawi and continuing on the inner ring road |
| D41 Sawangan–Lebak Bulus | Desari | confirmed | the official route name says VIA TOL Desari |
| SH1 / SH2 airport | Sedyatmo | confirmed | the airport service uses the airport toll |
| 7R, 7T, 7U, 7V, 7C, 7D, 7F | Jagorawi + Wiyoto | reported | Cibubur cross-city listing |
| B11/B21, T11/T12, S11 | Cikampek / Merak | reported | cross-city listings |
| 9, 9A | Dalam Kota | conditional | corridor 9 normally runs **beside** the inner ring road, not on it; some diversions use the toll |

The full list is in the JSON. The distinction matters: calling corridor 9 a
toll route by default would be wrong, and the data says so.

Sources:

- <https://id.wikipedia.org/wiki/Daftar_rute_Transjakarta>
- <https://id.wikipedia.org/wiki/Koridor_9_Transjakarta>
- <https://megapolitan.kompas.com/read/2023/01/20/01150081/rute-royaltrans-6p-cibubur-kuningan>
- <https://www.instagram.com/p/C0_zqq7P3Po?hl=en> (rider route listing; used only for `reported`)
- <https://www.youtube.com/watch?v=ccQ2pg_aEjs> (SH2 airport trip)

## Agent behaviour

`find_toll_routes` (`lineCode` or `toll` filter) returns the roads, gates,
confidence and source. `plan_journey` and `list_active_disruptions` expose
`viaToll` on the notice. Instructions tell the assistant:

- a skipped stop is not a closed corridor;
- if the origin or destination is skipped, lead with the walk to the nearest
  served stop;
- do not promise boarding or alighting at a skipped stop;
- say `confirmed`, `reported` or `conditional` rather than presenting every
  entry as a fact.

## Simulation

- Asked "Rute 6H lewat tol?" the assistant called `find_toll_routes` and
  `find_line`, and answered JORR with its gates and the long stop gap.
- A temporary notice "6H via Tol JORR, does not serve Cilandak" was inserted.
  The assistant answered that 6H is still operating, Cilandak is skipped,
  the bus passes without stopping, and the notice does not close the
  corridor. The fixture was deleted after the run.

## What is still approximate

The toll roads are a **route-level** mapping, not a geometric segment on the
line path. That is enough for the assistant to explain a skipped stretch,
but a future version should match the toll way geometry to the line geometry
and store the entrance/exit gates per direction. Until then, the tool says
"reported" or "conditional" where the source is not official.
