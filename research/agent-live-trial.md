# Live LLM trial, 30 October 2026

This trial used the real LLM provider. **Only the X API was stubbed**: no X
read or stream call was made. The model calls, Tavily review search and the
database/planner are real.

## Models

| Role | Model | Notes |
| --- | --- | --- |
| Main/classifier/temporary-service/review | `deepseek/deepseek-v4.1-flash-1017` | OpenRouter reports `text+image->text`; the temporary-service trial sent four images |
| Decision screen | `typesafe/jev-1.14` via TypeSafe System One | Jev answered the 9ST screen as a disruption/possible service change |
| Trace | Langfuse | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and base URL are configured |

The temporary-service trial was **not** a recorded decision: it called the
real `TemporaryServiceAgent` with the four attached images. The X envelope
is already covered by the offline stub test (`x-stub-trial.test.ts`).

## Jev screen

Input: the 9ST caption.

```json
{
  "disruptionProbability": 0.94,
  "restoredProbability": 0.02,
  "systemId": "transjakarta"
}
```

Jev passed the post to the main reader. The main classifier then read the
same post and correctly found **no actual disruption** (`isDisruption:
false`, `endsAt: null`): the 9ST is a new service, not a closure. The
temporary-service reader is the path that creates the overlay.

## Temporary service, real images

The real agent received the cover, the 9ST map and both night-route images.
It produced:

- code `9ST`;
- name `Grogol Reformasi - Roxy`;
- loop stops: `Grogol Reformasi → Roxy → Stasiun Grogol → Tanjung Duren Arah
  Timur → Grogol Reformasi`;
- every day, 05:00–22:00;
- start `2026-10-31T05:00+07:00`;
- no announced end;
- headway not published by the source, so the writer kept 10 minutes as a
  labelled estimate;
- confidence 0.78, status active;
- source quote: `9ST Grogol Reformasi - Roxy setiap hari pukul 05:00-22:00
  WIB (gambar)`.

The planner then found a **9-minute** journey on `9ST` from Grogol Reformasi
to Roxy on 31 October 06:00, ahead of the existing 17-minute alternative.
The fixture row was deleted after the trial.

This is evidence that the model can read all four images and that the
validation/writer/planner path works with a real decision.

## Duration classification, real main model

Two synthetic notices were sent to the real classifier.

### Long revitalisation, no end

```json
{
  "isDisruption": true,
  "kind": "diversion",
  "endsAt": null,
  "duration": {
    "horizon": "weeks",
    "reviewAfterHours": 24,
    "reason": "A halt revitalization start date is announced, but no completion date is given; the work is likely to span multiple weeks, so evidence should be checked again after 24 hours.",
    "confidence": 0.7
  },
  "scope": "stop"
}
```

The kind is not the duration: it classified a long revitalisation as a
`diversion`, but the duration reader still asked for a **24-hour evidence
review**, not an 8-hour closure expiry.

### Short incident, no end

```json
{
  "isDisruption": true,
  "kind": "closure",
  "endsAt": null,
  "duration": {
    "horizon": "hours",
    "reviewAfterHours": 4,
    "reason": "Accident-related temporary halt closure with no announced reopening time; likely an hours-scale incident.",
    "confidence": 0.8
  },
  "scope": "stop"
}
```

The same model chose four hours for an accident. No kind-to-hours table was
used.

## Review agent, real main model + Tavily

A synthetic long revitalisation notice was due for review with no recent
Posts. The review agent returned:

```json
{
  "verdict": "unknown",
  "endsAt": null,
  "reviewAfterHours": 72,
  "confidence": 0.35,
  "summary": "Tidak ada Post baru maupun sumber resmi/berita yang menyatakan status terbaru revitalisasi Halte Grogol, baik masih berlangsung maupun sudah selesai. Karena pekerjaan revitalisasi biasanya berlangsung lama, notice belum bisa ditutup dan perlu dicek ulang dalam beberapa hari.",
  "evidence": [],
  "usable": true
}
```

The monitor treats this as **active but unverified**, schedules the next
review in 72 hours and does **not** close it from silence. This is the
desired behaviour for a long project without an end.

## What is still not live

- No X API request: the X side is the local stub only.
- No production deployment; the live trial used a temporary script and a
  real database, then removed its fixtures.
- The full `pnpm eval:notices` labelled corpus was not run in this trial.
  It is the next real-model evaluation to run before shipping.
- Langfuse traces were emitted by the live calls, but the dashboard was not
  inspected for this note.

## Actual commands and checks

- `pnpm typecheck` and `pnpm lint` are the normal gates.
- `pnpm test` and `pnpm test:e2e` remain offline/fake-LLM except for the
  real-model trial above, which is not part of the deterministic suite.
- The real trial stopped cleanly when its temporary rows were deleted; no
  X credit was used.

## Implication for the design

The model can distinguish a four-hour accident from a multi-week
revitalisation from the announcement itself, even when both have no
`ends_at`. The missing piece was not classification of `kind`; it was
persisting the model's **horizon/review cadence** and letting a due review
agent decide with evidence. The implementation now does that:

- classifier emits `duration.{horizon, reviewAfterHours, reason, confidence}`;
- monitor stores `review_at` and `duration_assessment`;
- `expireStaleDisruptions()` skips rows with a model-assigned `review_at`;
- only a due, evidence-backed review can resolve them;
- `unknown` keeps the notice visible as unverified.

## Clean workflow trial: managed through the monitor

The user asked for the temporary shuttle to be deleted before the real run,
so the trial could observe whether the normal workflow creates it from
scratch. The run was:

1. `temporary_services` was empty (`before: 0`).
2. A local HTTP server returned the real X v2 envelope: four media objects,
   a 296-character `note_post`, and no author expansion.
3. The real X client parsed it.
4. Real Jev screened the text: `disruptionProbability: 0.93`,
   `restoredProbability: 0.02`, `systemId: transjakarta`.
5. The real monitor ingested the Post and ran the queue:
   - the classifier marked it as **not a disruption** (`skipped: 1`);
   - the temporary-service path wrote **one** overlay (`temporaryServices:
     1`);
   - no notice was created.
6. The overlay row:
   - code `9ST`;
   - name `Grogol Reformasi - Roxy`;
   - start `2026-10-31 05:00 WIB`;
   - review `2026-11-13`;
   - confidence `0.70`;
   - source quote from the announcement.
7. Planner:
   - 31 October 06:00 → an **8-minute** temporary-service journey;
   - 30 October (before its start) → no temporary line;
   - 31 October 23:00 (after its 22:00 window) → no temporary line.
8. The test cleaned the temporary row and the social Post:
   `temporaryServices: 0`, no fixture rows left.

This is the path the user asked to trace: **empty table → X stub → real
model decision → writer → planner**, then cleanup. The only stubbed piece was
the X server and its media URLs (data URIs of the attached images, because a
remote model cannot fetch the local files).
