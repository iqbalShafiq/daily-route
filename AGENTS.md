# AGENTS.md

Guidance for coding agents working in this repository. It is the single
source of truth for how the code is organised and what the rules are. If
something here conflicts with a habit you have, the habit loses.

## What this project is

Daily Route answers one question for people in Greater Jakarta: **how do I
get from A to B right now, and is the way still open?** It covers
Transjakarta (BRT, Metrotrans, Royaltrans, Minitrans, Mikrotrans), MRT
Jakarta, LRT Jakarta, LRT Jabodebek and KRL Jabodetabek.

Two halves of the same data:

- a **deterministic** planner (A* over a station graph) that never guesses;
- an **agentic** assistant that reads the rider's question, calls the same
  planner through tools, checks the operators' announcements, and explains
  the answer.

The agent is never the source of truth about the network. The graph is.

## Commands

```bash
pnpm install                # install the workspace
pnpm infra:up               # start Postgres + pgvector on port 5433
pnpm db:migrate             # apply the Drizzle migrations
pnpm db:seed                # load data/transit-network.json
pnpm data:ingest            # rebuild the snapshot from OpenStreetMap + research
pnpm data:embed             # recompute the station embeddings
pnpm dev                    # API (3011), worker (4012) and web (3010)
pnpm typecheck              # tsc --noEmit in every package
pnpm lint                   # eslint in every package
pnpm test                   # unit and integration tests
pnpm test:e2e               # Playwright, starts the API and the web app
pnpm build                  # production builds
```

`pnpm dev` and every `pnpm db:*` script load the **root `.env`** through
`dotenv-cli`. There is exactly one `.env` in this repository. Never add a
second one inside a package.

## Repository layout

```
apps/
  api/      Express HTTP API: transit reads, route planning, agent chat (SSE)
  web/      React + TanStack + Tailwind v4 front end
  worker/   Background monitor: polls X and Tavily, writes disruptions
packages/
  config/   Shared tsconfig and ESLint configuration
  env/      The one place that validates the environment
  db/       Drizzle schema, queries, migrations, seed
  transit/  Pure domain: graph, A* planner, geo, fares, text normalisation
  semantic/ Embedding providers and the place resolver
  agent/    Anvia agent, tools, classifier, monitor, X and Tavily clients
  ingest/   OpenStreetMap extraction and the curated/OSM merge
data/       The committed network snapshot the seed loads
research/   The research reports and their structured extracts
```

A package may only depend on packages below it. `packages/transit` is pure
TypeScript with no framework and no database — keep it that way.

## Boundaries

- **Secrets stay on the server.** Provider keys, database URLs and the X
  bearer token never reach the browser. Nothing secret uses a `VITE_` prefix
  (there is no `VITE_` prefix in this project at all).
- **The browser never talks to a model provider.** It calls the application
  API, and the API calls the provider.
- **Dependencies are injected.** A function takes the database, the resolver
  or the model configuration as an argument. No module reads `process.env`
  at import time, and no module keeps a module-level singleton connection.
- **The graph is the truth.** The model may name a place; the resolver
  decides which station that name refers to; the planner decides the route.
  Never let the model produce a station id, a coordinate, a duration or a
  fare.
- The planner judges a journey on **time, distance and the number of
  changes together**, and the waiting time for a new vehicle is part of
  it. The best route is the one with the lowest cost, not the one with the
  fewest kilometres.
- **No fallback that invents data.** When a provider is missing, the feature
  reports the missing cause and the rest of the application keeps working.
  A deterministic stand-in is acceptable only when it is *labelled* as such
  (the local embedding encoder is the one exception, and it is named
  `local/hash-ngram-v1` in the database).
- **No backwards compatibility.** The project is pre-release. Change the
  schema, change the seed, change the consumer in one commit. Do not add
  adapters, shims or migration code for a shape that never shipped.

## The data pipeline

`data/transit-network.json` is committed and is the input of the seed. It is
produced by `pnpm data:ingest`, which merges two sources:

- **OpenStreetMap** (ODbL) for coordinates, route relations, stop order and
  the **path every vehicle travels** (the way members of a route relation);
- **`research/data/*.json`** for the official line names, operators, service
  classes, stop lists, interchange notes and the **published fares**.

Rules for the merge, in priority order:

1. The curated report owns the **name and the order** of a line's stops.
2. OpenStreetMap owns the **coordinates** and contributes any stop the
   curated list is missing.
3. The OSM relation name wins for the **service class**, because it states
   the brand outright ("Minitrans 1M", "Metrotrans 5F").
4. A station of a line that is not open yet never becomes routable. The
   research notes mark those stations; `isPlanned()` reads the marker.
5. A station of a different system with a matching name, within 400 m, or
   with an alias the report gives as an interchange, within 1.2 km, is the
   same place. The stations of one hub are never spread over more than
   600 m, so a hub is always one place a rider can walk through.

The path of a line is stitched from the way members of its relation,
simplified to three metres, and stored per direction with the index of
every stop along it. The planner measures the distance between two stops
**along that path**, so the time it estimates is the time the vehicle
needs, and the line drawn on the map follows the road.

When you change the pipeline, re-run `pnpm data:ingest && pnpm db:seed &&
pnpm data:embed`, and check `data/transit-network.json` in the diff. A
shrinking station count is a red flag, not a cleanup.

## The agent

- Construct agents with `new Agent({...})` from `@anvia/core`. There is no
  builder API.
- The model id comes from `AGENT_MODEL`; never hard-code a model slug.
- Every tool is read-only and returns a plain object the model can read.
  A tool that cannot answer returns a reason, not a guess.
- The tool catalog is built per request. A tool whose credentials are
  missing is not added to the catalog; the model is told the source is
  unavailable instead of calling something that always fails.
- The disruption classifier returns a structured record. The station ids in
  that record are produced by the resolver, not by the model.
- The route tool answers with a **verdict**: `terbuka`, `terhalang` or
  `tidak-diketahui`, plus the fare and the distance. The instructions tell
  the model to lead with the obstruction when there is one, and to mention
  a change of vehicle only when there is one.
- Instructions describe **behaviour**, not permissions. The tool layer is
  the wall.

## Front end

Read `DESIGN.md` before touching the interface. The short version:

- Tailwind v4 through `@tailwindcss/vite`. There is no `tailwind.config.js`
  and no `postcss.config.js`.
- Colours come from the tokens in `apps/web/src/styles.css`. Never write a
  hex value in a component.
- The type scale is 40, 28, 20, 16, 15, 13 and 12 pixels, and 12 pixels
  is the floor. `research/tools/ux-visual/typography_check.py` reads the
  source and must report nothing: no size outside the scale, no colour
  outside the tokens, no wording that breaks the rules in `DESIGN.md`.
- The words follow the operators: a bus stops at a halte, a train at a
  stasiun; a journey is a "perjalanan"; a fare is a "tarif"; the time is
  written "10.14 WIB" and rupiah is written "Rp5.000".
- Icons are `lucide-react`, one icon per meaning, with a tooltip on every
  icon-only control.
- Layout is CSS Grid. No percentage flexbox arithmetic.
- The map owns the window. There is no bar across the top, and the
  controls float on the map: the search surface in the top left, the
  answer below it, the window controls in the top right.
  `research/tools/ux-visual/layout_check.py` reads the source and must
  report nothing.
- The search is one surface, not a card with a form inside it. On a
  phone it is the full width of the window. The button that runs the
  search is the last control of the form, and the button that swaps
  the two places sits on the hairline between the two lines.
- The journey is framed in the room the rider can see. The margins
  around it are the `--map-pad-*` variables in `apps/web/src/styles.css`,
  and the map reads them when it frames a journey. The height of the
  search bar on a phone is `--bar-h`.
- Motion is short and purposeful: an answer rises into place, a list
  of suggestions opens from its field, and the map moves with `easeTo`
  and `fitBounds`. `prefers-reduced-motion` still turns all of it off.
- Full-height regions use `dvh`, never `vh` and never a fixed pixel height.
- Every asynchronous surface has a loading, an empty and an error state.
- The place field is a combobox: the focus stays in the input, the active
  suggestion is pointed at with `aria-activedescendant`, and the matched
  part of a name is marked only when the server reported the range.
- A rider who is standing somewhere can ask for the walk to the stop
  that serves that place. The browser gives the position, the server
  asks the pedestrian router for the path, and the panel shows the
  street names and the distance. The walk is the first leg of the
  journey, on the map as well as in the list.
- The map answers a pointer with a popover and a click with a move. The
  camera moves with `easeTo` for a point and `fitBounds` for a journey;
  `flyTo` is for a jump between places that are far apart.
- The list of the journey and the map are one system: pointing at a leg
  in the list keeps that leg bright on the map.
- The mode colours are the operator's taxonomy, not the livery of the
  vehicles, and they are checked for colour-blind separation. A mode is
  encoded twice: colour and line width.
- No emoji anywhere in code, markup or copy.

## Testing

- **Integration tests** live next to the code they exercise
  (`apps/api/src/app.test.ts`) and run against the real database. Do not
  mock the database.
- **End-to-end tests** live in `apps/web/e2e/` and drive the real
  application through Playwright, on a phone viewport and on a desktop one.
- Unit tests are welcome for pure logic, but the priority is integration and
  end-to-end coverage. Prefer a test that exercises the whole path over
  several tests that exercise a mock.

## Definition of done

A change is finished when:

- `pnpm typecheck` is clean,
- `pnpm lint` is clean,
- `pnpm test` and `pnpm test:e2e` pass,
- the change follows the boundaries above,
- and the documentation (`AGENTS.md`, `DESIGN.md`, `README.md`) still
  describes the code as it is.

## Prohibited

- Writing a `console.log` in the browser.
- `any` in TypeScript. Use `unknown` and narrow it.
- `!` non-null assertions outside of tests.
- A second `.env`.
- A hard-coded coordinate, station name or duration that came from a
  memory rather than from the data.
- Commenting out a failing test instead of fixing it.
