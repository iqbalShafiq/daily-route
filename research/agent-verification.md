# Notices that know their own time

**Question.** A running event closes a road on 24 and 25 October. It does not
close the road for both whole days. How should the agent read the
announcement, find the exact windows, and keep the notice off the map when
nothing is happening?

The short answer: treat a notice as an **event with one or more impact
windows**, and use a **verification agent** with retrieval, quotation and a
second pass before those windows are written. Do not parse the text with a
date regex, and do not give the whole event one `endsAt` that covers both
days.

## What the standards already say

GTFS-Realtime Service Alerts use a list of `active_period` time ranges, not
one end timestamp. An alert may be present in the feed while it is not active
yet, and it may have several ranges (a nightly closure is seven ranges, not
one week). The newer guidance separates the **communication period** (when
riders should be told) from the **impact period** (when the service is
actually affected), and recommends one interval per recurrence. It also says
to leave the end open when it is not known, and to include it later.

Sources:

- [GTFS-Realtime Service Alerts guidelines](https://gtfs.org/resources/mobilitydata-recommendations/gtfs-realtime-service-alerts/guidelines)
- [Service Alert example, `active_period`](https://developers.google.com/transit/gtfs-realtime/examples/alerts)
- [Handling GTFS Service Alerts](https://www.transit-data.com/gtfs-realtime-integration/handling-gtfs-service-alerts)
- [Transit app: alerts and time ranges](https://resources.transitapp.com/article/461-alerts)

Our current `disruptions.ends_at` is a single end. That is the wrong shape for
this problem. It is also why the Jakarta Running Festival notice stayed on the
map after the morning corridor-9 window had ended: the row carried the last
day of the event, not the window that was actually in force.

## What the research says about the agent

A single generation is not a verification. The useful patterns are:

1. **Plan the checks, then answer them separately.** Chain-of-Verification
   (CoVe) gets better accuracy when the verification questions are answered
   without the draft answer in context; the model is less likely to repeat its
   own mistake. [CoVe paper](https://arxiv.org/abs/2309.11495)
2. **Retrieve before deciding, and stop when the evidence is sufficient.**
   FIRE asks a small set of claim-specific questions, retrieves for each, and
   stops early when the claim is already supported or refuted; it reports
   lower search cost and better accuracy than a single broad search.
   [FIRE](https://aclanthology.org/2025.findings-naacl.158.pdf)
3. **Check temporal consistency explicitly.** A fact-checking agent that
   compares dates, times and event identity across sources catches the
   "same event, different day" error that a text-only classifier misses.
   [Agent-SP](https://arxiv.org/html/2512.22933v1)
4. **Rank sources and quote them.** Operator announcement > operator website
   > established news > social reply. Every window should carry a URL and a
   short quote. If two reliable sources disagree, keep both windows and mark
   the notice `needs_review`; do not average them.
5. **Treat extraction as a system component.** Event extraction is more
   reliable when the schema is explicit and the output is checked against the
   schema, the network and the clock, not when a free-form summary is trusted.
   [Event extraction survey](https://arxiv.org/html/2512.19537v1)
6. **Use temporal knowledge graphs for the joins.** The OpenAI temporal-agent
   cookbook models facts with `valid_at` and `invalid_at`, which is the same
   shape as a validity window and makes "was this true at 10:00?" a query
   rather than a guess.
   [Temporal agents with knowledge graphs](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents)

## The model

### A notice is an event, not a paragraph

```
Disruption
  eventKey
  title, body, severity, kind
  communicationStartsAt, communicationEndsAt   # when to tell riders
  windows: ValidityWindow[]                    # when the service is affected
  evidence: Evidence[]                         # URL + quote + source + fetchedAt
  verification: "verified" | "partial" | "needs_review"
  lastVerifiedAt
```

```
ValidityWindow
  startsAt, endsAt        # ISO instants, always with an offset
  timezone                # Asia/Jakarta
  scope                   # line ids / station ids / system, or "network"
  reason                  # "corridor 9 via toll", "10H skips three halts"
  evidenceUrl, quote
  confidence              # 0..1, from the verifier, not the classifier
```

A window with no end is allowed. That is the GTFS guidance for an unknown
end. It is not the same as an all-day window. A window whose end is in the
past does not keep the notice on the map. A window in the future makes the
notice **upcoming**, which is a different presentation from **active now**.

### The verification agent

The classifier's job stays narrow: is this a disruption, which operator,
which lines and stops, and does it need checking? It sets
`needsVerification` when the announcement contains a date, a time, a
route-specific window, or a location that is not obvious from the post.

The verifier is a separate agent with these tools:

- `cari_berita` — search the open web and the operators' sites;
- `buka_halaman` — fetch a URL and return readable text, not HTML;
- `cari_posting` — read the operator's recent posts and the thread around the
  source post (the X client already stores `conversation_id`);
- `cek_jaringan` — resolve a line code or stop name to network ids (the
  resolver, not the model).

Its loop is:

1. **Extract claims.** "Corridor 9 is diverted via the toll road from 03:00 to
   09:00 on 24 October", "10H skips Gerbang Pemuda, Senayan Bank Jakarta and
   Bundaran Senayan from 05:00 to 09:00", "SH2 is diverted on 25 October".
2. **Plan one query per claim**, not one query for the whole event.
3. **Fetch the best page** for each result and quote the sentence that
   supports the claim.
4. **Cross-check** the date, the start, the end, the timezone, the line and
   the stop. If a claim has only one source, keep it with `partial`; if two
   reliable sources disagree, keep both and set `needs_review`.
5. **Challenge the draft.** A second call receives the claims and the
   evidence but not the draft summary, and answers: what would make this
   wrong? Which date is missing? Is this a communication period or an impact
   period? (This is the CoVe step.)
6. **Write only the supported windows.** No window means no impact on the
   map, even if the notice is still being communicated.

The agent never writes a coordinate or a line id from memory. The network
resolver grounds the scope; the code only validates ISO instants, ordering,
timezone and overlap.

### What the rider sees

- **Active now** — a rail and a marker on the map; the row says
  "Until 09:00 WIB".
- **Upcoming** — no map marker; the row says "24 Oct, 03:00–09:00 WIB" and a
  clock, and the board can filter to it.
- **Ended** — gone from the map; the board can keep it in a closed section
  for a day.
- A notice with several windows shows the next window first, not the end of
  the event.

The planner matches a window against the journey time. A warning diversion
that affects one direction or one segment must not make the whole corridor
look closed. A critical closure with no window is still treated as active
until a later announcement closes it.

## Why not a date parser

A regex can find "24-25 October". It cannot decide that the first day's
window is 03:00–09:00, that the second day's window belongs to a different
route, or that a reply from the operator is a correction. The hard part is
not the date token; it is **which claim belongs to which route, on which day,
from which source, and whether that source is current**. The model does the
reading; the schema and the verifier make the reading checkable.

## Evaluation

Before trusting the verifier, build a small golden set:

- 30 real notices with human-labelled windows, scopes and sources;
- score window precision and recall, date/time exactness, scope exactness,
  unsupported-window rate, and `needs_review` recall;
- trace every run in Langfuse with the query, the fetched URLs, the quotes and
  the final windows;
- a window is only accepted if it has a source URL and a quote; a model
  confidence without evidence is not enough.

The first production gate should be: no window is written without evidence,
and no notice is shown as active now unless a window covers the current time.
