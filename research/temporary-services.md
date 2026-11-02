# Temporary services from X announcements

**Status:** implemented overlay + agent reader + stubbed X trial (29 October 2026).

## The case

Transjakarta announced a JPO repair at Grogol starting **31 October 2026
05:00 WIB**. During the repair it runs a new shuttle, **9ST: Grogol
Reformasi – Roxy**, 05:00–22:00. The Post carries four images: the cover,
the 9ST loop map, and two night-time route suggestions using existing
corridors 9, 8 and 3.

This is not an incident. It is a **future, bounded service addition**. A
notice-only model cannot represent it, and a manual `data/transit-network.json`
edit would be wrong: the route is not permanent, has a validity window, and
must disappear when the announcement is withdrawn or expires.

## X API: what is correct

The implementation uses the official v2 media expansion:

```http
GET /2/tweets/search/recent
  ?query=from:PT_Transjakarta -is:retweet -is:reply
  &tweet.fields=created_at,author_id,lang,conversation_id,
    referenced_tweets,in_reply_to_user_id,note_post,attachments
  &expansions=attachments.media_keys
  &media.fields=url,preview_image_url,alt_text,type
```

```http
GET /2/tweets/search/stream
  ?tweet.fields=created_at,author_id,lang,conversation_id,
    referenced_tweets,in_reply_to_user_id,note_tweet,attachments
  &expansions=attachments.media_keys
  &media.fields=url,preview_image_url,alt_text,type
```

- `attachments.media_keys` is an **array**. Every key is joined to
  `includes.media[]` by `media_key`; the order of the keys is the order the
  images are sent to the model. A Post can carry **up to four photos** (or
  one GIF/video). No per-image parameter exists.
- **Recent search names the long-form field `note_post`.** The filtered
  stream still exposes it as `note_tweet`. Sending the wrong name leaves
  `text` truncated at 280 characters, which is exactly what would happen to
  this announcement. `xPostOf()` reads both, but the request builders keep
  separate field lists.
- `attachments.media_keys` returns Media objects in `includes.media`, not
  User objects. It does **not** create a billable User Read. `author_id` is
  only an id string; expanding `author_id` is what adds a User Read. The
  runtime stream and catch-up do not request it.
- The stream and recent search both accept `expansions` and `media.fields`.
- Media fields used: `url`, `preview_image_url`, `alt_text`, `type`. For a
  video, `preview_image_url` is the readable thumbnail; for a photo, `url`.
- Official references:
  - [Expansions](https://docs.x.com/x-api/fundamentals/expansions)
  - [Fields](https://docs.x.com/x-api/fundamentals/fields)
  - [Search recent Posts](https://docs.x.com/x-api/posts/search-recent-posts)
  - [Filtered stream](https://docs.x.com/x-api/stream/stream-filtered-posts)
  - [Pricing](https://docs.x.com/x-api/getting-started/pricing)
  - [Media introduction](https://docs.x.com/x-api/media/introduction)
  - [Post cap](https://docs.x.com/x-api/fundamentals/post-cap)

The docs are currently inconsistent: the recent-search OpenAPI enum uses
`note_post`, while the stream and the data dictionary still say
`note_tweet`. The code does not guess: it uses the name for the endpoint it
calls and accepts either in the parser.

## Architecture

```
stored X Post (text + media URLs)
        |
        v
broad trigger: "shuttle/rute/koridor" + "mulai/mengoperasikan/..."
        |
        v
TemporaryServiceAgent (multimodal, all images)
        |
        v
structured proposal (code, name, stop NAMES, windows, start/end, quote)
        |
        v
TemporaryServiceWriter
  - resolve every stop name against the real network
  - reject unresolved names, no station id is invented
  - reject a code that belongs to a permanent line
  - validate dates and daily windows
  - store source Post, image URLs, quote, confidence
        |
        v
temporary_services (Postgres)
        |
        v
withTemporaryServices(network, services)
  - add a normal Line + LineStops + Geometry
  - metadata.temporary = true
  - service source = "temporary", validFrom/validUntil
        |
        v
planner / map / find_line / plan_journey see one normal line
```

### Why an overlay, not a seed edit

- The committed network is not touched. The seed can be rebuilt without
  losing or duplicating an announcement.
- The overlay has a source Post, quote, image URLs and confidence. A rider
  can see why it exists.
- It can be updated by a later announcement about the same `event_key` and
  disappear at the announced end without a deploy.
- The planner continues to be the source of truth for time, distance and
  fare. The model only supplies names and the announcement.
- A stop must already exist. If the announcement names a place the network
  does not have, the writer rejects it instead of inventing a coordinate.
  The next step for that gap is a temporary station with an official
  coordinate and its own provenance, not a guessed point.

### Validity

- `starts_at` is the first instant the service may be used.
- `ends_at` is the announced end, or `null`.
- `serviceAt()` checks the line's `validFrom`/`validUntil`; a journey planned
  before the start or after the end cannot board it. This is why the 9ST can
  be inserted on 29 October for a 31 October journey.
- `review_at` is **not** an operational end. It is the next time a person or
  a periodic verifier should re-read the source. The default is start + 14
  days. A stale service is not silently deleted; a future review job should
  mark it `needs_review`/`withdrawn`.
- A confidence below 0.65 is stored as `needs_review` and is not applied to
  the planner.

### Geometry

The official map gives stop order, not a road shape. The overlay draws a
straight polyline through the stop coordinates and marks the line
`temporary`. This is honest for a planner: stop-to-stop distance is
approximate, and the line is not presented as the permanent alignment. A
future version can compose the shape from the corridor geometries it borrows
(the same machinery as `withDiversions`).

### Frequency

The announcement gives a window, not a headway. The writer uses **10 minutes
as a labelled planner estimate** (`headwayEstimated: true`) only when the
agent reports no frequency. The route board should say the frequency is
estimated, or omit it; it is not an official departure. If the operator
publishes a headway, the field is used as written.

## The trial

No X top-up was used. `x-stub-trial.test.ts` starts a real local HTTP server
that returns the X v2 envelope:

- `data[0].attachments.media_keys` has **four** keys;
- `includes.media` has four matching objects;
- `data[0].note_post.text` is the full 300+ character announcement;
- `meta` has the newest/oldest id.

The real `createXClient()` parses it. The test asserts:

- four media URLs survive, in the media-key order;
- the full `note_post` survives (not the 280-character `text`);
- the request contains `expansions=attachments.media_keys`,
  `media.fields=url,preview_image_url,alt_text,type`, and `note_post`;
- it does **not** contain `expansions=author_id` or `note_tweet`;
- a recorded **agent decision** (the object the
  `temporaryServiceProposalSchema` produces) goes through the real
  `TemporaryServiceWriter`, the real `temporary_services` table and the real
  planner;
- the resulting 9ST line is usable on 31 October at 06:00, not before its
  start and not after 22:00;
- the API test plans the same overlay and returns a leg with
  `temporary: true`.

The decision is recorded because the configured `AGENT_MODEL` in this
environment is a text model and the X API is not topped up. In production the
same object is produced by `TemporaryServiceAgent` from the four images.

Run:

```bash
pnpm --filter @daily-route/agent test src/x-stub-trial.test.ts
pnpm --filter @daily-route/agent test src/temporary-service.test.ts
pnpm --filter @daily-route/api test src/temporary-service.test.ts
```

## What is deliberately not done yet

- **A vision model is a deployment requirement.** The code sends all images
  as image parts, but a text-only model cannot read the map. Configure a
  vision-capable classifier/service model before relying on this in
  production. The trial records the decision so the rest of the path is
  testable without one.
- **No temporary stations.** A named stop that is absent from the network
  rejects the proposal. A later phase should let an official coordinate from
  the source create a `temporary` station, with the same provenance rules.
- **No withdrawal agent.** A later Post that says the shuttle has ended
  should resolve the overlay. The current table supports status changes and
  `ends_at`, but the reader only creates/refreshes; it does not yet detect
  "layanan selesai".
- **No road shape for the new service.** The straight stop polyline is
  labelled approximate; borrowing existing corridor shapes is the next step.
- **A temporary pattern of an existing code** (for example a short-turn of
  corridor 9) is rejected because cloning the code would create two lines
  with the same identity. That needs a temporary `line_pattern`, not a new
  `line`.
- **No manual admin write.** The only writer is the agent path. There is no
  endpoint that lets a client insert a temporary route.
