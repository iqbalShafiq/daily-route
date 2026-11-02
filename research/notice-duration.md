# Notice duration: from a fixed TTL to an agentic review loop

**Status:** implemented 30 October 2026. The classifier now emits a model
`duration` assessment; the monitor stores `review_at`/`duration_assessment`;
a due review agent decides with evidence. The old kind fallback remains only
for legacy rows or rows without an assessment. Real LLM trial results are in
[`agent-live-trial.md`](agent-live-trial.md).

## The legacy fallback

`expireStaleDisruptions()` in `packages/agent/src/monitor.ts` still contains
the old fallback for a legacy row or a row without a duration assessment.
The number comes from `noticeTtlHours(kind, severity)`:

| Kind | Fallback |
| --- | ---: |
| `delay` | 4 h |
| `weather` | 8 h |
| `diversion`, `closure`, `service-change`, `unknown` | **8 h** |
| `strike` | 48 h |
| `maintenance` | 72 h |

The rules around it matter:

- A notice with its own `endsAt` is closed by `closeElapsedNotices()` at that
  instant, not by the fallback.
- A notice with validity windows or a future `startsAt` is not cut short by
  the fallback. Once it starts, the anchor is the start (or the newest
  confirmation, whichever is later).
- A newer Post or Reply that still describes the event moves `lastSeenAt`, so
  the deadline moves with it. `news` sources are capped at 24 h.
- At expiry the row is marked `resolved` with `resolvedReason = "expired"`.
  It is not literally checking for a later "selesai" post at that moment;
  the later post normally arrives through the stream and either refreshes or
  resolves the notice first.

So the answer to "apakah 8 jam lalu ditutup kalau tidak ada pengumuman
selesai?" is: **yes for an incidental diversion/closure with no explicit
end and no newer confirmation**, but not for `delay`, `weather`, `strike`,
`maintenance`, a notice with an explicit end, or one with verified windows.

Rows with a model-assigned `review_at` are explicitly skipped by this
fallback. They are governed by the review agent, not by the kind table.

## Why a kind table is not enough

A "revitalisasi" or a multi-week repair is not an incident with an 8-hour
shape. If it is classified as `maintenance`, it still gets only 72 hours. If
it is classified as a `closure`, it gets 8. A long project will disappear
from the board unless the operator keeps posting, even though the works are
still ongoing. Conversely, extending every closure because the word
"revitalisasi" appears would be a keyword rule and would keep unrelated
works alive.

The missing concept is **the event's expected horizon and the next time the
evidence should be checked**, not a kind-to-hours table.

## Agentic design

### 1. Duration reader at intake

A dedicated agent runs after a notice is written, only when the notice has
no explicit end and no verified windows. It receives:

- the announcement text, images and source URL;
- the operator and the grounded scope;
- previous notices for the same `event_key`;
- recent operator Posts;
- results from the existing Tavily search/extract tools;
- the official project/page source when one exists.

It returns a structured **duration assessment**, not a route decision:

```json
{
  "expectedHorizon": "hours | day | multi-day | weeks | months | unknown",
  "reviewAt": "2026-11-02T09:00:00+07:00",
  "reviewCadenceHours": 24,
  "confidence": 0.82,
  "evidence": [
    { "url": "https://...", "quote": "perbaikan berlangsung hingga ..." }
  ],
  "reason": "Pekerjaan JPO terjadwal; belum ada tanggal selesai resmi.",
  "canExtendWithoutNewEvidence": false
}
```

The model chooses the horizon from meaning and evidence, not from a keyword
or from `kind`. "Revitalisasi", "pembangunan", "perbaikan bertahap" and a
published project page can lead to a weeks/months horizon; "kecelakaan",
"pohon tumbang" or a temporary road closure can lead to hours. A model that
cannot find evidence says `unknown` and asks for a short review, rather than
inventing an end.

### 2. Review agent at the due time

A durable review queue (`review_at`, `review_state`, `last_verified_at`)
selects notices whose review is due. The review agent receives the notice,
its history, the newer Posts and fresh Tavily results, and decides:

- `resolved` — a source says the disruption is over;
- `still-active` — a source confirms it is ongoing; extend `review_at`;
- `unverified` — no source either way; keep the notice but mark it
  "unverified since ..." and schedule a human/next review;
- `escalate` — contradictory sources or a high-impact closure with no
  evidence.

A review is **not** a timer that closes the notice. The timer only wakes the
agent. The agent's decision, evidence and confidence are recorded in an
audit row.

### 3. Continuity from the stream

The existing classifier still reads new Posts and Replies. A confirmation
moves `lastSeenAt`; a "layanan kembali normal" resolves the notice. The review
agent covers the silence between Posts; it does not replace the stream.

### 4. Guardrails, not a hidden TTL

- An explicit `ends_at` or verified validity window always wins.
- An extension needs evidence; a model cannot extend indefinitely on prose
  alone.
- A safety ceiling exists for an unverified notice (for example a human
  review after a long silence), but it is a guardrail, not the normal
  decision. The UI must say "unverified", not silently present it as current.
- Every review writes the model, prompt version, evidence URLs, quote,
  decision and confidence. Low confidence does not change the network.
- Cost is bounded: only notices whose review is due are read, not every
  post, and identical searches are cached/coalesced.

### 5. How it handles the three shapes

| Case | Agentic behaviour |
| --- | --- |
| Short incident, no end | Duration reader sees an incident; short review. Review agent checks Posts/news; if nothing confirms it, marks unverified/closed with low confidence. |
| Multi-day repair | Reader sees planned works and perhaps an official page; schedules daily/next-milestone reviews. Each review extends only with evidence. |
| Weeks/months revitalisation | Reader extracts an explicit project end or an official page; sets a long horizon and monthly/next-milestone review. No 8/72-hour fallback applies. |
| Temporary service (9ST) | The same review model checks the source Post and official page; extends the overlay or marks it withdrawn. It is not a notice TTL. |

### 6. What to change in the code

1. Add `review_at`, `review_state`, `last_verified_at` and a
   `duration_assessment` JSON to `disruptions` (or a `notice_reviews` table
   for the audit history).
2. Add `NoticeDurationAgent` with the existing Tavily search/extract tools
   and a structured output schema.
3. Call it after insert/update when there is no explicit end/validity.
4. Add a review queue/worker that claims due notices and calls
   `NoticeReviewAgent`; record every decision.
5. Change `expireStaleDisruptions()` so the agent's `review_at` is the
   primary path. Keep `noticeTtlHours()` only as an explicit emergency
   fallback when the agent is unavailable, and label that state in the UI.
6. Add fake-agent tests for short, multi-day, extension, resolution and
   no-evidence cases, plus a real-model eval in `pnpm eval:notices` with
   labelled cases.
7. Show "Last verified" and "Next review" in the notice surface; an
   unverified notice must not look like a freshly confirmed one.

## Current tests and the real model

`pnpm test` and `pnpm test:e2e` do **not** call a real LLM. They use fake
classifiers, fake X responses, recorded agent decisions and a real database
and planner. The real-model path is the separate live trial
([`agent-live-trial.md`](agent-live-trial.md)) and `pnpm eval:notices`
(production/labelled eval). The X API is the only stubbed dependency; the
live trial used `deepseek/deepseek-v4.1-flash-1017` with images, Jev through
TypeSafe System One, and Tavily.

The implemented path is:

1. `DisruptionAnalysis.duration` from the main classifier (with images when
   present);
2. `review_at`, `review_state`, `last_verified_at` and
   `duration_assessment` on `disruptions`;
3. `NoticeReviewAgent` with Tavily, run only for due notices, at most two
   per tick;
4. an `unknown` verdict keeps the notice active as unverified; only evidence
   can resolve it;
5. the old 8/72-hour table is skipped for agentic rows and remains a safety
   fallback for legacy rows.

The live trial in [`agent-live-trial.md`](agent-live-trial.md) shows a
real main model choosing four hours for an accident, 24 hours for a
multi-week revitalisation, and a real review agent returning `unknown` (and
keeping the notice visible) when Tavily finds no evidence.
