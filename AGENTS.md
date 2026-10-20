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
  transit/  Pure domain: graph, A* planner, geo, text normalisation
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
  Never let the model produce a station id, a coordinate or a duration.
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

- **OpenStreetMap** (ODbL) for coordinates, route relations and stop order;
- **`research/data/*.json`** for the official line names, operators, service
  classes, stop lists and interchange notes.

Rules for the merge, in priority order:

1. The curated report owns the **name and the order** of a line's stops.
2. OpenStreetMap owns the **coordinates** and contributes any stop the
   curated list is missing.
3. The OSM relation name wins for the **service class**, because it states
   the brand outright ("Minitrans 1M", "Metrotrans 5F").
4. A station of a line that is not open yet never becomes routable. The
   research notes mark those stations; `isPlanned()` reads the marker.
5. A station of a different system within 250 m with a matching name is the
   same interchange, and becomes a `station_group`.

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
- Instructions describe **behaviour**, not permissions. The tool layer is
  the wall.

## Front end

Read `DESIGN.md` before touching the interface. The short version:

- Tailwind v4 through `@tailwindcss/vite`. There is no `tailwind.config.js`
  and no `postcss.config.js`.
- Colours come from the tokens in `apps/web/src/styles.css`. Never write a
  hex value in a component.
- Icons are `lucide-react`, one icon per meaning, with a tooltip on every
  icon-only control.
- Layout is CSS Grid. No percentage flexbox arithmetic.
- Full-height regions use `dvh`, never `vh` and never a fixed pixel height.
- Every asynchronous surface has a loading, an empty and an error state.
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
