# Jakarta Running Festival 2026: a closure, its alternatives and its end

The simulation used the real network, the real notices the worker stored and
the public schedule of the event. Nothing here is a fixture.

## The event

The Jakarta Running Festival 2026 closed roads on 24–25 October. On Sunday
25 October the closure ran **02.30–09.15 WIB**, covering Jl. Jenderal
Sudirman, both sides of Jl. Gatot Subroto, Jl. Gerbang Pemuda, Jl. Asia
Afrika, Jl. M.H. Thamrin and the Kuningan area. The sources are the event's
own road-closure PDF and Kompas/Metro TV reporting.

At 08:54 WIB the closure was still in force. The notices did not say so: the
classifier had no hours, so they would have stayed on the board for the
service-change lifetime (72 h). That is the gap the schedule researcher fills.

## During the closure

The journey **Grogol Reformasi → Simpang Kuningan** was blocked, because the
9A diversion no longer calls at Simpang Kuningan and the corridor 9 diversion
does the same. The planner:

- kept the corridor as a pass-through but could not alight at the named stop;
- moved the alighting point to Bulog and added an **egress walk** back to
  Simpang Kuningan;
- offered **two alternatives** that avoid the blocked line, with different
  primary lines, fares and durations;
- returned `routeBlocked: true` instead of a silent route.

The chat answer named the obstruction first, the two alternatives, the
walking transfer and the end time, and told the rider not to alight at
Simpang Kuningan.

## The schedule

The researcher (query planner → Tavily → reader with no tools) returned:

- event: Jakarta Running Festival 2026
- window: `2026-10-25T02:30:00+07:00` – `2026-10-25T09:15:00+07:00`
- quote: "Penutupan jalan ini berlangsung sejak pukul 02.30 hingga 09.15 WIB."
- source: a news page that reprinted the event schedule

The monitor writes that window as `starts_at`/`ends_at` and keeps the quote in
`metadata.research`. A monitor integration test covers the write.

## After 09.15

At **09:15:05 WIB** the corridor 9 notice closed with `resolved_reason =
announcement-end`, without a follow-up post. The route then returned
`routeBlocked: false`, two direct itineraries (corridor 9 in 41 minutes and
9A in 42 minutes) and no walk. The corridor 9 and 9A notices were no longer
in the active board; the archive keeps them, and `list_notice_history` returns
them with `resolvedAt`.

The rest of the JRF notices closed on a later operator post that said every
diverted or shortened service was back to normal. By 14:31 WIB the board had
**no JRF notice left** (26 other notices remained). A chat at 14:56 answered
"the route is open", named corridor 9 and the 41-minute trip, quoted the
restoration post, and explained that the archive entries were already
resolved. A `pnpm backtest:notices` run on the diversion posts grounded
corridor 9 to Simpang Kuningan, Petamburan and Pancoran Tugu; the restoration
posts were classified as not-a-notice, as they should be.

## Incidental vs planned

A planned event has a published window, so `needsSchedule` is true and the
researcher runs. An incidental accident has no schedule; the classifier
leaves `needsSchedule` false, the researcher is not called, and the notice
stays until a follow-up or its kind's lifetime. The active JAK 05 diversion
near Jl. Syekh Nawawi is such a row: no end time, no invented one.

## What changed because of the simulation

- `removesService` treats a stop that a diversion no longer calls at as out
  of service; before, only `closure` blocked a stop-scope notice.
- The API kept the rider's original place when a closed stop moved the
  boarding or alighting point, so the walk leg is no longer lost.
- The classifier separates `diversion` (a stop is skipped) from
  `service-change` (the hours change and every stop is still served).
- The chat agent has `list_notice_history`; the worker has the schedule
  researcher and the classifier's `needsSchedule` flag.
- Search tools take structured filters: X handles/since/until/lang/size and
  Tavily time range/topic/domains/depth.
