# The current-place trial

The current-place feature was tested on 5 November 2026. The deterministic
suite runs against the real database, the real API and a real browser. The
model part runs against the configured `AGENT_MODEL`
(`deepseek/deepseek-v4.1-flash-1017` at the time of the trial) through the
real `/api/agent/chat` SSE route.

The X API was not needed and was not called. The chat path reads the planner
and the stored notices; the monitor's stream is a separate process. The trial
is therefore unaffected by the X balance.

## The commands

```bash
pnpm trial:current-place   # strict scenario trial
pnpm eval:current-place    # Anvia eval with exact metrics and an LLM judge
```

Both write a JSON report next to this file:
[`current-place-trial.json`](current-place-trial.json) and
[`current-place-eval.json`](current-place-eval.json). They are not part of
`pnpm test`: a live model costs money and changes its wording.

## The model scenarios

All seven passed on the final run.

| Case | What the trial sent | What it checked |
| --- | --- | --- |
| Route from here | marked place at Bundaran HI, "from here to Kelapa Gading" | `plan_journey` is called with `originCurrent: true`; the answer uses the walk to the boarding stop and the first route only; no stop outside the tool result is named |
| Where am I | same marked place, "where am I and which stop is nearest" | the answer names Bundaran HI and its address |
| No marked place | "from here to Kota" with no `current` | no `plan_journey`; the answer asks for the current place |
| Outside the box | current at Paris | no `plan_journey`; the answer says the position is outside Jabodetabek |
| No destination | "from here" with a marked place | no `plan_journey`; the answer asks for the destination |
| Saved place by label | signed-in rider with "Home" saved at Bundaran HI | `list_my_places` and `plan_journey`; the plan starts from Home, not from a guessed stop |
| Too far from a stop | marked place in the south-west of the box | the answer says there is no stop within walking distance; no route is invented |

The first two runs exposed a weak answer: the model merged a walk with a
route and named a stop the tool had not returned. The tool result now carries
`asal.dari` and `asal.jalanKaki`, the prompt asks for the walk first, for one
route by default, and for only stops the tool returned, and the trial fails a
scenario that names a station outside the plan. The final run passed all
seven.

## The deterministic cases

The browser tests cover both projects (desktop and Pixel 5):

- the current address is prefilled in the account's add-place form;
- the label is prefilled as "Current location" and can be renamed;
- the saved place keeps its address through the account write;
- the From field shows the address and the route is asked for in one step;
- a missing destination marks the place without asking for a journey;
- a refused browser permission shows the error and leaves From empty;
- a position outside Jabodetabek shows the API's reason in the account sheet;
- the route legend has a distinct colour per vehicle and lights the map on
  hover.

The unit and integration tests cover:

- reverse geocoding success, a missing name, an address split into parts, a
  failure and the cache;
- an address saved with a named place and read back;
- the 16-label cap and case-insensitive replacement;
- `plan_journey` from the marked place, from a saved place, and with no marked
  place;
- a current place outside the box;
- a walk whose pedestrian path is unavailable keeping no line;
- a ride with no stored OSM path keeping no line;
- the route tool's first-route-only default.

## The Anvia evaluation

`pnpm eval:current-place` runs the same seven cases through `runEvalSuite`
from `@anvia/core/evals`, against the real HTTP route and the real model. The
final run passed **7/7 cases and 21/21 metrics**.

| Metric | What it checks |
| --- | --- |
| `tool_use` | The case's required tools were called and its forbidden tools were not |
| `grounded_stops` | A network stop named by the answer appears in a tool result or is the marked place |
| `answer_quality` | An Anvia `llmJudge` reads the expected behaviour, the answer, the tools, the plan and the allowed names |

The judge is the only non-exact metric. The two exact metrics make the eval
fail even when the judge is too generous: a route that invents a stop, or a
no-route case that calls `plan_journey`, is caught without the model.

The final run used 70,233 target tokens and 8,210 judge tokens. The report is
[`current-place-eval.json`](current-place-eval.json).

## The map path rules

A line on the map is a path, not a straight connection. A ride takes the
stored OSM-derived line geometry; a walk takes the pedestrian router's path.
If either path is missing, the leg draws no line. The list still shows the
walk's time and distance. The relevant tests are
`apps/api/src/walk-geometry.test.ts` and
`packages/transit/src/graph.test.ts`.

## Langfuse

Both commands send the production trace to Langfuse through
`langfuseObservability` in the shared observed agent. The final runs were
read back from the Langfuse API, not assumed from the log:

- trial session `current-place-trial:2026-11-05T06:34:21.101Z`: **7 root
  traces**, one per scenario, each with the agent, turn, generation and tool
  observations as children;
- eval run `current-place-eval:2026-11-05T06:48:19.713Z`: **7 root traces**,
  one per case, under `<run id>:<case id>` sessions. Each trace carries the
  three eval scores (`tool_use`, `grounded_stops`, `answer_quality`) through
  the Anvia Langfuse eval reporter, so the score sits on the same trace as
  the run that produced it.

The trace name is `chat-rute`, the same name the production chat route uses.
The trial's session id is in `current-place-trial.json`; the eval's prefix is
in `current-place-eval.json`. A Langfuse write failure does not fail the
trial: the observer is best-effort, as it is in production. The eval's score
report uses `onMissingTrace: "warn"` for the same reason.

## What the trial does not cover

The live X stream is not part of the current-place path, so it was not
started. The monitor, the classifier and the notice pipeline have their own
tests. A real route can change with the service windows and the notices, so
the exact journey in the report is a record of that time, not a fixture.

The test agent uses the production instructions and the planner tools, but
not the production-only live news and street lookup tools. None of the seven
cases asks for a news search or a street lookup; the disruption question is
answered by `list_active_disruptions`, which is present.
