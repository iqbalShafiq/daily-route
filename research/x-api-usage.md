# X API usage and cost

Measured from the development database on 28 October 2026, 16:10 WIB.
The source tables are `usage_events` (the app's estimate) and
`social_posts` (the posts that were actually stored). No token or database
URL is written here.

## The short answer

The X bill is **not a bug in the code**: X charges **$0.005 for every Post
read**, and the monitor has stored **1,914 Posts** since 23 October. That is
**$9.57 in Post reads alone**, before the user objects returned by
`expansions=author_id` (another **$0.010 per user resource**). A $10 top-up
is therefore already spent, which matches the negative balance.

The app's own ledger shows only **$3.845**, because it recorded usage from
**25 October 15:15 WIB** onwards. The other 1,145 stored Posts are not
represented in `usage_events`.

## What the ledger recorded

Period: **25 October 2026 15:15 WIB – 28 October 2026 15:58 WIB** (3.03 days).

| Metric | Value |
| --- | ---: |
| X usage events | 847 |
| Post reads | 769 |
| Estimated Post cost | **$3.845** |
| Stream errors (402/network) | 401, cost $0 |
| Average Post cost | $0.005 |

### By operation

| Operation / endpoint | Events | Requests | Posts | Cost | Share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Monitor — recent search (catch-up) | 96 | 96 | 442 | $2.210 | 57.5% |
| Monitor — filtered stream | 752 | 752 | 317 | $1.585 | 41.2% |
| Probe — recent search | 1 | 1 | 10 | $0.050 | 1.3% |

The 752 stream events include about 32 successful connection opens (0 Posts,
$0) and 317 Post deliveries. The 401 errors are the `402 CreditsDepleted`
reconnects after the credit ran out; they cost $0 but are noisy.

### Catch-up shape

| Catch-up calls | Calls | Posts | Cost |
| --- | ---: | ---: | ---: |
| Returned no Posts | 62 | 0 | $0 |
| Returned at least one Post | 34 | 442 | $2.210 |

- Average over all 96 calls: **4.6 Posts / $0.023**.
- Average over a non-empty call: **13 Posts / $0.065**.
- Largest call: **83 Posts / $0.415**.
- The catch-up is 57.5% of the recorded cost, because it carries the posts
  published while the stream was down.

### By day

| Day (WIB) | Post reads | Cost |
| --- | ---: | ---: |
| 25 Oct (partial) | 116 | $0.580 |
| 26 Oct | 296 | $1.480 |
| 27 Oct | 267 | $1.335 |
| 28 Oct (until 15:58) | 90 | $0.450 |
| **Total** | **769** | **$3.845** |

The two full days average **281 Posts/day**, or about **$1.41/day** and
**$42/month** for Post reads alone.

## The missing 1,145 Posts

`social_posts` has **1,914 unique Posts**, all real operator Posts (no
`contoh:` rows):

| Author | Posts |
| --- | ---: |
| PT Transjakarta | 1,120 |
| KAI121 | 775 |
| lrtjkt | 19 |
| **Total** | **1,914** |

At $0.005 per Post that is **$9.57**. The ledger has 769 of those Posts; the
other 1,145 are not represented in the usage table, mostly the initial
catch-up on 23–24 October. The arithmetic is consistent:

```
1,914 × $0.005 = $9.57 Post reads
$10.00 credit − $9.57 = $0.43 before user reads
```

User reads push it below zero.

## The uncounted user reads

The client sends `expansions=author_id` and `user.fields=username,name` on
both the stream and recent search. X bills each returned user resource at
**$0.010**, and an expanded author is a user resource. The app's
`costUsd` only counts Posts:

```ts
costUsd: (event.posts ?? 0) * X_COST_PER_POST_USD
```

So the ledger is a lower bound. The size of the missing part depends on X's
24-hour deduplication:

- If users are deduplicated within a UTC day: roughly 3 active operators ×
  4 days = **$0.12** for the ledger period, and the full corpus stays near
  **$0.30**.
- If each response/Post is charged without dedupe: 317 stream Posts + 34
  non-empty catch-up responses + 10 probe Posts ≈ **$3.61** for the ledger
  period, and up to **$19.14** for the full 1,914 Posts.
- The real number is in the X Developer Console. The point is that **the
  app's $3.845 is not the invoice**; it is the Post-read part only.

## Cost per call

X bills **resources returned**, not HTTP requests. A call with zero results
is free.

| Call | Billed resource | Zero results | Our average | 100 results |
| --- | --- | ---: | ---: | ---: |
| `GET /2/tweets/search/stream` (connect) | no resource | $0 | $0 | $0 |
| One Post delivered by the stream | 1 Post + author expansion | — | $0.005 + user | $0.50 |
| `GET /2/tweets/search/recent` | each Post + each user | $0 | 4.6 Posts = $0.023 | $0.50 |
| `GET /2/users/by/username/:handle` | 1 user | $0 (404) | $0.010 | — |
| Stream rules add/delete | no read resource | $0 | $0 | — |

With the author expansion, a non-empty recent-search call is about
**$0.033** at our average, not $0.023. The 100-Post row is Post reads only;
add up to $1.00 for 100 distinct authors.

## Is it reasonable?

**As an X bill: yes.** $0.005 per Post is the current pay-per-use rate, and
1,914 Posts is $9.57. There is no overcharge or runaway loop in the Post
count.

**As a notice monitor: it is expensive for the result.** The monitor pays
for every operator Post and reply, then classifies them. In the recorded
period:

- **At least 454 of 769 Posts were replies** (210 known on the stream, 244 in
  catch-up). That is at least **$2.27**, or 59% of the Post cost; the true
  share is higher because 315 rows have no `postType` metadata.
- Catch-up was 57.5% of the cost. It is necessary after a disconnect, but a
  reconnect loop makes it read more often.
- The 401 `CreditsDepleted` attempts cost $0, but should stop until the
  account is topped up.

## What to change, in order

1. **Drop `expansions=author_id` where the handle is already known.** The
   stream rule tag tells us the operator; catch-up queries are `from:handle`.
   The handle can come from the rule, not from a paid user object. This
   removes an entire uncounted $0.010/user line.
2. **Decide whether replies are worth at least 59% of the bill.** If notices only
   come from original Posts, add `-is:reply` to the rules and catch-up. If
   replies matter, keep them, but budget for them.
3. **Stop reconnecting on 402.** `CreditsDepleted` is permanent until a
   top-up; the current supervisor retries about once a minute (401 attempts
   in about 7 hours). No cost, but it hides the real state and fills the
   log.
4. **Budget $20–25, not $10, for the current scope.** At 250–280 Post
   reads/day, $10 lasts about 7–8 days. If the monitor is only for a demo,
   cap the catch-up pages or run it only during the hours that matter.
5. **Add the user-read term to the ledger.** Until then, use
   `Posts × $0.005` as a floor and check the X Developer Console for the
   invoice.

## Sources

- X API pay-per-usage pricing, including Post read $0.005 and User read
  $0.010: https://docs.x.com/x-api/getting-started/pricing
- X staff answer that `expansions=author_id` user objects are billed as User
  Reads, and are deduplicated within a response:
  https://devcommunity.x.com/t/do-tweet-expansions-add-user-read-charges-on-top-of-post-read-when-looking-up-my-own-posts-by-id/275286

## Follow-up implemented on 29 October 2026

The runtime was narrowed after the report:

1. **The catch-up is back, but bounded.** It reads only original Posts
   (`-is:reply`), only newer than the last stored Post or Reply, and never
   older than **eight hours**. It asks for one page and does not request
   author expansions. The old catch-up was 96 calls, 442 Posts and $2.21
   (57.5% of the recorded spend); the new one cannot replay a week of
   replies and cannot read Posts older than the window.
2. **The `search_posts` X tool is removed from the chat agent.** Tavily
   `search_news` is the only live search the assistant can call. The ledger
   had **no chat X events**, so this changes future cost, not the $3.845
   already spent.
3. **`expansions=author_id` is gone from the runtime.** The stream derives
   the handle from its rule tag; the catch-up knows the handle from
   `from:<handle>`. The runtime therefore has no User Read term and the
   ledger does not need a `user_reads` column. The manual verification and
   corpus CLIs may still expand author profiles; they are not part of the
   worker ledger.
4. **Images are now part of a Post.** The stream and catch-up request
   `attachments.media_keys` and `media.fields`, store the image URLs in
   `social_posts.metadata.media`, and the classifier receives the image as
   an actual image part. The text-only screen does not drop an image-only
   notice before the classifier sees it.

The operator handles are corrected at the same time: **@mrtjakarta** for
MRT Jakarta and **@CommuterLine** for KAI Commuter (KRL Jabodetabek).
**@lrtjabodebek** and **@lrtjkt** were already correct. The old
**@KAI121** rows (775 stored Posts, 4 linked notices in the dev database)
stay in history, but the stream will not add new ones.

## Follow-up, 29 October 2026: multi-image and long-form fields

- The media request is unchanged in cost terms: `expansions=attachments.media_keys`
  returns Media objects, not Users, so it does not add a User read. A Post
  can carry up to four photos. The client stores every key in
  `attachments.media_keys`, in order; the classifier sends every image.
- Recent search uses `note_post` for the full text of a long Post; the
  filtered stream still uses `note_tweet`. The request builders now send the
  correct name per endpoint, and `xPostOf()` accepts either. Using
  `note_tweet` on recent search would leave the text truncated at 280
  characters, which is a correctness bug before it is a cost issue.
- The offline trial (`packages/agent/src/x-stub-trial.test.ts`) runs a local
  HTTP server with the real v2 envelope: four `media_keys`, four
  `includes.media`, and a `note_post`. It asserts the request has no
  `expansions=author_id` and that all four images and the full note survive.
  No live X call was made.
- Official references: [Expansions](https://docs.x.com/x-api/fundamentals/expansions),
  [Fields](https://docs.x.com/x-api/fundamentals/fields),
  [Search recent Posts](https://docs.x.com/x-api/posts/search-recent-posts),
  [Filtered stream](https://docs.x.com/x-api/stream/stream-filtered-posts),
  [Pricing](https://docs.x.com/x-api/getting-started/pricing),
  [Media introduction](https://docs.x.com/x-api/media/introduction).
