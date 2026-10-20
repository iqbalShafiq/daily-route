# API Integrations Research — Jakarta Transit App

**Scope:** external API integrations for a Jakarta transit app (routing + service-disruption alerts).
**Compiled:** 2026-10-20 (Asia/Jakarta).
**Verification method:** every claim below is backed either by (a) a URL fetched with `curl`/`web_fetch` during this research, or (b) an official docs page fetched in raw Markdown form. Anything I could not confirm is explicitly marked **UNVERIFIED**.

> **Important context note up front:** the X API no longer sells Free/Basic/Pro subscriptions. As of the docs fetched on 2026-10-20, X moved to **pay-per-use credit pricing** with no tiers. The "Free/Basic/Pro" framing in the original brief is outdated. See §1.1.

---

## 1. X (Twitter) API v2 — monitoring official transit operator accounts

### 1.1 Current commercial model: pay-per-use credits, not tiers

Source: <https://docs.x.com/x-api/getting-started/pricing.md> (fetched 2026-10-20, 313 lines) and
<https://docs.x.com/x-api/getting-started/about-x-api.md>.

- "The X API uses **pay-per-usage** pricing. **No subscriptions**—pay only for what you use."
- You **pre-purchase credits** in the Developer Console; credits are deducted per resource returned.
- There is a **24-hour UTC deduplication window**: re-requesting the same Post within the same UTC day is not charged again.
- **Owned Reads** (reading your *own* app's data) cost **$0.001/resource**; general **Post reads cost $0.005/resource**.
- Pay-per-usage plans are capped at **3,000,000 Post reads per monthly billing cycle** (Enterprise above that).
- Free-credit incentives: **$20** after adding a payment card + making a first credit purchase, plus a **match of your first auto-recharge up to $50** (one-time, expire after 3 months). There is **no permanent free tier** — you must add a card.

**Read cost table (verified):**

| Resource | Unit cost |
|---|---|
| Posts: Read | **$0.005** per resource |
| User: Read | $0.010 per resource |
| DM Event: Read | $0.010 per resource |
| Following/Followers: Read | $0.010 per resource |
| List: Read | $0.005 per resource |
| Space: Read | $0.005 per resource |
| Like: Read | $0.001 per resource |

**Cost model for this app:** 5 operator accounts polled every 5 minutes = 288 polls/day × 5 accounts = 1,440 requests/day. If each returns ~1 new post, that is ~1,440 posts/day = **$7.20/day ≈ $216/month**. With 24h dedup, re-reading the same posts is free, so **incremental cost is dominated by genuinely new posts, not requests**. See §1.7 for the cheaper polling design.

### 1.2 Endpoints

Base URL: `https://api.x.com` (the legacy `https://api.twitter.com` alias also resolves — verified below).

| Method | Endpoint | Purpose | Auth | Verified |
|---|---|---|---|---|
| GET | `/2/tweets/search/recent` | Search last **7 days** | Bearer (app-only) works; OAuth 1.0a user context also | ✅ HTTP 401 without key → endpoint live |
| GET | `/2/tweets/search/all` | Full archive back to 2006 | Pay-per-use + Enterprise only | ✅ listed in rate-limit table |
| GET | `/2/tweets/search/stream` | **Filtered stream** (real-time) | Bearer (app-only) | ✅ listed in rate-limit table |
| GET | `/2/tweets/search/stream/rules` | List active stream rules | Bearer | ✅ |
| POST | `/2/tweets/search/stream/rules` | Add / delete rules | Bearer | ✅ |
| GET | `/2/users/by/username/:username` | Resolve handle → user id | Bearer | ✅ HTTP 401 without key |
| GET | `/2/users/:id/tweets` | User timeline | Bearer | ✅ in rate-limit table |
| GET | `/2/users/by/username/:username/tweets` | User tweets by handle | Bearer | ✅ in rate-limit table (1,500/15min per app) |
| GET | `/2/usage/tweets` | Daily Post consumption counters (free REST) | Bearer | ✅ in pricing doc |
| GET | `/2/news/search` | X News search (200/15min) | Bearer | ✅ in rate-limit table |
| GET | `/2/activity/stream` | Activity/Account-Activity stream (2 connections) | Bearer | ✅ |
| POST | `/2/webhooks` | Webhook delivery (alternative to holding a stream open) | Bearer | ✅ |

**Also relevant:** X now ships **Powerstream** (`/x-api/powerstream/introduction`), described as "our **lowest-latency streaming API** for accessing public X data in real-time" — an alternative to Filtered Stream. I did not fetch the Powerstream endpoint reference in detail → **UNVERIFIED** at the endpoint/param level.

### 1.3 Authentication

Source: <https://docs.x.com/fundamentals/authentication/overview.md>.

Four methods exist:

| Method | Use |
|---|---|
| **OAuth 2.0 App-only (Bearer)** | Read publicly available data — **this is what you want** for operator monitoring |
| OAuth 1.0a User Context | Act on behalf of a user / private data |
| OAuth 2.0 Authorization Code + PKCE (user context) | Multi-device user scopes |
| HTTP Basic | Enterprise APIs only |

The Bearer token is obtained in the Developer Console → your App → "Keys and tokens" → **App-only Access Token** (a long-lived `AAAA...` string). App-only tokens are the documented way to read public posts; OAuth 1.0a user context is **not required** for these endpoints (it only changes the per-app vs per-user rate-limit bucket and costs you user consent).

**Rate-limit buckets:** *Per-app* limits apply with a Bearer (app-only) token; *per-user* limits apply with OAuth 1.0a / OAuth 2.0 user tokens. **Use app-only Bearer** — that gives you the higher per-app numbers.

### 1.4 Rate limits (X API v2) — verified table

Source: <https://docs.x.com/x-api/fundamentals/rate-limits.md>. Limits are per 15 minutes unless noted.

| Method | Endpoint | Per App (Bearer) | Per User | Notes |
|---|---|---|---|---|
| GET | `/2/tweets/search/recent` | **450 / 15 min** | 300 / 15 min | 10 default, **100 max** results; 512 query length |
| GET | `/2/tweets/search/all` | 1/sec, 300/15min | 1/sec | 10 default, 500 max; 1024 query length |
| GET | `/2/tweets/counts/recent` | 300/15min | — | 512 query length |
| GET | `/2/tweets/search/stream` | **50 / 15 min** | — | **1 connection; 1000 rules; 1024 rule length; 250 posts/sec** |
| GET | `/2/tweets/search/stream/rules` | 450/15min | — | 1 connection; 1000 rules |
| POST | `/2/tweets/search/stream/rules` | 100/15min | — | 1 connection; 1000 rules |
| GET | `/2/tweets` | 3,500/15min | 5,000/15min | |
| GET | `/2/tweets/:id` | 450/15min | 900/15min | |
| GET | `/2/users/:id/tweets` | 10,000/15min | 900/15min | |
| GET | `/2/users/by/username/:username/tweets` | 1,500/15min | 900/15min | |
| GET | `/2/users/by/username/:username` | 300/15min | 900/15min | |
| GET | `/2/users/:id` | 300/15min | 900/15min | |
| GET | `/2/usage/tweets` | 50/15min | — | |
| GET | `/2/news/search` | 200/15min | 200/15min | |
| POST | `/2/tweets` (write) | 10,000 / 24 hrs | 100/15min | Not needed here |

**Response headers on every response:**

```
x-rate-limit-limit: 900
x-rate-limit-remaining: 847
x-rate-limit-reset: 1705420800
```

429 error body:

```json
{ "errors": [ { "code": 88, "message": "Rate limit exceeded" } ] }
```

> Note: the recent-search "posts per 24 h" concept from the old Free/Basic/Pro tiers **no longer exists as a quota**. Posts are now billed per-read and only hard-capped at 3M Post reads/month on pay-per-use. There is **no 24-hour post cap** on the pay-per-use model.

### 1.5 Recent search rules

Source: <https://docs.x.com/x-api/posts/search/introduction.md> and <https://docs.x.com/x-api/posts/search-recent-posts.md>.

- **Reach: last 7 days.** "Search Posts from the **last 7 days**. Available to all developers." `start_time` must be within the last 7 days (per the endpoint schema description).
- **Results per request: 10 default, 100 maximum** (`max_results`: `minimum: 10`, `maximum: 100`, `default: 10`).
- **Query length:** the docs prose and the rate-limit table both say **512 characters** for recent search (4,096 for Enterprise). ⚠️ The endpoint's OpenAPI schema in `search-recent-posts.md` declares `query` `maxLength: 4096`. **These disagree** — treat **512 as the safe limit** for recent search (4096 is the full-archive/Enterprise figure). *Discrepancy observed, not a doc bug I can resolve.*
- **Mutually exclusive params:** at most one of `start_time`/`since_id`; at most one of `end_time`/`until_id`; at most one of `pagination_token`/`next_token`.
- **Operators** (from the same page):
  - User: `from:handle`, `to:handle`, `retweets_of:handle`
  - Filter: `lang:`, `-is:retweet`, `-is:reply`, `is:verified`
  - Content: `has:images`, `has:videos`, `has:links`, `has:mentions`, `url:`
  - Boolean: `(A OR B)`, `"exact phrase"`, `#hashtag`, `@mention`
- **Pagination:** `next_token` / `pagination_token` (base32hex-encoded) — see <https://docs.x.com/x-api/posts/search/integrate/paginate.md>.

**Multi-handle OR filter (the pattern this app needs):**

```
(from:PT_Transjakarta OR from:mrtjakarta OR from:lrtjkt OR from:lrtjabodebek OR from:KAI121) -is:retweet -is:reply
```

> ⚠️ **UNVERIFIED:** I did not confirm from the docs whether the X search parser accepts a parenthesised OR of five `from:` operators, nor whether there is a per-query operator-count cap. Historically X's parser has been finicky about long OR groups. **Verify with a live call before shipping.** Safe fallback: one request per handle (5 requests per poll — still well inside 450/15min), or a single `from:` per request with `since_id`.

### 1.6 Filtered stream specifics

Source: <https://docs.x.com/x-api/posts/filtered-stream/introduction.md>, `.../integrate/build-a-rule.md`, <https://docs.x.com/x-api/fundamentals/recovery-and-redundancy.md>, `.../handling-disconnections.md`.

**Access levels table (verbatim from the intro page):**

| Feature | Pay-per-use | Enterprise |
|---|---|---|
| Rules per project | **1,000** | 25,000+ |
| Rule length | **1,024 chars** | 2,048 chars |
| Connections | **1** | Multiple |
| Core operators | ✓ | ✓ |
| Semantic embedding operators | — | ✓ (requires Embedding tier) |

- **Does it require a paid tier?** Yes. The old model gated Filtered Stream behind Pro/Enterprise. Under the current pay-per-use model there is no "tier" gate — Filtered Stream is listed as a Pay-per-use feature, but it is **billed per post read ($0.005 each)** like everything else. The only "tier"-style gate left is the **Enterprise-only `embedding:` semantic operator** and Enterprise connection counts. **VERIFIED from the docs table.**
- **One connection per filter rule set** — confirmed: "Connections: 1" for pay-per-use; Enterprise gets multiple. The rate-limit table also annotates the stream endpoint with "1 connection". (Note: `POST /2/tweets/search/stream/rules` lets you add/delete rules **without disconnecting** — "You do not need to disconnect to add or remove rules.")
- **Max rules per stream:** **1,000** per project (pay-per-use).
- **Latency:** ~**4–5 seconds P99** ("Filtered Stream prioritizes data hydration and delivery, with approximately 4-5 seconds of P99 latency"). For lower latency, X points to **Powerstream**.
- **Throughput:** 250 posts/sec.
- **Keep-alive:** the stream sends a **blank line (`\r\n`) every 20 seconds**. "If you don't receive data or a keep-alive for 20 seconds, reconnect." Set your HTTP read timeout to 20s.
- **Disconnect causes:** upstream operational disconnects (`{"title":"operational-disconnect","disconnect_type":"UpstreamOperationalDisconnect"}`), network drops, deploys, idle timeouts. Reconnect immediately; exponential backoff, **max delay 320 seconds**.
- **Backfill:** on reconnect you may pass **`?backfill_minutes=N`** for disconnects of **≤ 5 minutes**:
  `GET /2/tweets/search/stream?backfill_minutes=5`. ⚠️ "Posts are **not** deduplicated" — if you were down 90s and request 2 minutes of backfill you get 30s of duplicates. **Deduplicate on post id yourself.**
- **Recovery (longer outages):** replay missed data from within the **last 24 hours** using `start_time`/`end_time` (ISO 8601 UTC). Filtered Stream allows **2 concurrent recovery jobs**.
- **Redundant connections:** 2 redundant connections for **Enterprise** projects only (pay-per-use = 1).
- **Webhooks:** you can receive filtered-stream posts via webhooks instead of holding a connection open (`POST /2/webhooks`).

**Rule syntax constraints** (`build-a-rule.md`):
- Operators are **case-insensitive**.
- Diacritics matter: `diacrítica` matches *diacrítica* but **not** *diacritica*.
- **Conjunction-required operators** (like `to:`, `retweets_of:`) **cannot be used alone** in a rule — you must include at least one standalone operator, e.g. add a keyword. So a bare `from:X` rule is fine (standalone), but a bare `to:X` rule is not.

### 1.7 No-auth / public alternatives for reading public account posts

Verified by curl on 2026-10-20:

| Endpoint | Result | Verdict |
|---|---|---|
| `https://api.x.com/2/tweets/search/recent?query=test` | **HTTP 401** `{"title":"Unauthorized",...,"status":401}` | Auth mandatory |
| `https://api.twitter.com/2/tweets/search/recent?query=test` | **HTTP 401** | Alias, auth mandatory |
| `https://api.x.com/2/users/by/username/PT_Transjakarta` | **HTTP 401** | Auth mandatory |
| `https://nitter.net/PT_Transjakarta/rss` | **HTTP 410 Gone** (0 bytes) | **Dead** |
| `https://nitter.poast.org/PT_Transjakarta/rss` | **HTTP 000** (connection failed) | **Dead / unreachable** |
| `https://xcancel.com/PT_Transjakarta/rss` | **HTTP 451** (Unavailable For Legal Reasons) | **Blocked** |
| `https://rsshub.app/twitter/user/24620414` | **HTTP 302** redirect (anti-bot / auth wall) | Unreliable |
| `https://cdn.syndication.twimg.com/widgets/timelines/profile?screen_name=PT_Transjakarta` | **HTTP 200 but 0 bytes** | **Dead** — the widget endpoint now requires a `token` param derived from the user id and no longer returns data |
| `https://cdn.syndication.twimg.com/widgets/followbutton/profile.json?screen_names=PT_Transjakarta` | **HTTP 404** (0 bytes) | **Dead** |
| `https://api.fxtwitter.com/PT_Transjakarta` | **HTTP 200**, real JSON | **Works** (third-party proxy, see below) |

**`api.fxtwitter.com` (and `api.vxtwitter.com`) — third-party, no-auth, UNSTABLE:**

```bash
curl -s "https://api.fxtwitter.com/PT_Transjakarta" | python3 -m json.tool
```

```json
{
  "code": 200,
  "message": "OK",
  "user": {
    "screen_name": "PT_Transjakarta",
    "id": "104556071",
    "followers": 571025,
    "tweets": 745787,
    "name": "Transportasi Jakarta",
    "description": "Akun X (twitter) official PT Transportasi Jakarta (Transjakarta)",
    "verification": { "verified": true, "verified_at": null, "type": "individual" }
  }
}
```

- **Reliability:** unofficial, third-party, no SLA, no docs, can vanish. It proxies X's internal GraphQL, which X changes frequently. `/status` (latest tweet) returned `{"code":200}` but with empty tweet fields in my test — so it is **not** a dependable feed source.
- **ToS implications:** fxtwitter is **not** affiliated with X. Scraping/aggregating public posts through a third-party proxy is **not covered by your X API agreement**, and X's Developer Agreement & Policy governs automated access to X data. Using it in a production app risks both (a) breakage and (b) a ToS violation with no contractual protection. **Use it for development/spike-time handle discovery and verification only — not as a production feed.**
- **RSS via nitter:** effectively dead as of this test. Do not design around it.

**Bottom line:** there is **no supported no-auth path**. Production monitoring requires an X API app + credits.

### 1.8 Official Greater Jakarta operator handles — VERIFIED

Verified two ways: (1) each operator's own website footer link, and (2) the `api.fxtwitter.com` profile lookup (which returned the live account id, follower count, tweet count, bio, and verification badge type).

| Operator | Handle | User ID | Followers | Tweets | Verified badge | Bio | Source of truth |
|---|---|---|---|---|---|---|---|
| **PT Transjakarta** (busway / BRT, Mikrotrans, feeder) | **`@PT_Transjakarta`** | `104556071` | 571,025 | 745,787 | ✅ `verified: true`, type `individual` | "Akun X (twitter) official PT Transportasi Jakarta (Transjakarta)" | ✅ linked from `https://www.transjakarta.co.id/` → `https://x.com/pt_transjakarta` |
| **MRT Jakarta** (North–South + East–West) | **`@mrtjakarta`** | `78847590` | 109,647 | 38,640 | ✅ `verified: true`, type `individual` | "Akun Informasi Resmi MRT Jakarta" | ⚠️ **UNVERIFIED from official site** — `mrtjakarta.co.id` was **unreachable** (HTTP 000) from this environment, so the handle is confirmed only via the account bio ("Akun Informasi Resmi") + verified badge |
| **LRT Jakarta** (Kelapa Gading–Jatinegara) | **`@lrtjkt`** | `846894897139363841` | 24,459 | 4,764 | ❌ `verified: false` | "LRT Jakarta" + CARLA contact | ✅ linked from `https://www.lrtjakarta.co.id/` → `https://twitter.com/lrtjkt` |
| **LRT Jabodebek** (Bekasi–Depok–Tangerang) | **`@lrtjabodebek`** | `1453976897981849602` | 10,339 | 1,974 | ❌ `verified: false` | "Akun Resmi LRT Jabodebek, Transportasi Cerdas Mobilitas Tanpa Batas" | ⚠️ **UNVERIFIED from official site** — `lrtjabodebek.co.id` / `jakarta.lrtjabodebek.co.id` were **unreachable** (HTTP 000); handle confirmed via the account's self-description |
| **PT Kereta Api Indonesia (KAI)** | **`@KAI121`** | `516165629` | **1,283,358** | 1,481,336 | ✅ `verified: true`, type `organization` | "Official X, Layanan Pelanggan PT Kereta Api Indonesia" | ✅ linked from `https://www.kai.id/` → `https://twitter.com/KAI121` |

**Handle-pitfalls I verified — do not use these:**

| Rejected handle | Why |
|---|---|
| `@TransJakarta` | Exists but is a **different, near-empty account** (id `24620414`, 4,058 followers, **7 tweets**, bio "Updates for the TransJakarta BusWay System"). The real account is `@PT_Transjakarta` (571k followers, 745k tweets). |
| `@KAICommuter` | ❌ **A parody account** — 20 followers, 2 tweets, bio literally says "AKUN PARODI OLEH". **Do not ingest.** |
| `@KAI`, `@kai`, `@KAI_Indonesia`, `@Commuter`, `@commuter` | All **HTTP 404** on the profile lookup — do not exist. |
| `@Jabodebek` | An unrelated property agent account (1 follower). |
| `@railway` | Unrelated (a cloud platform). |

**KAI Commuter:** the commuter service is operated by KAI; there is **no separate verified official @-handle for KAI Commuter** that I could verify. `@KAI121` is the official KAI account and posts commuter service updates (Cikarang Loop, scores, etc.). **UNVERIFIED:** whether KAI Commuter has a separate account under another name.

**Other useful Jakarta operator accounts** (not requested, but commonly the ones that actually post disruptions): `@DishubKemenhub`, `@BPJT`, `@jakarta_tdk`, `@Polres Jakarta` — **UNVERIFIED**, I did not check them.

### 1.9 Concrete recommendation + working requests

#### Option A (recommended default): poll recent search every 5 minutes, one request per handle

Single handle, incremental via `since_id` (the cheapest and most reliable pattern):

```bash
#!/usr/bin/env bash
# Poll one operator's latest posts. Requires: X_APP_BEARER_TOKEN
set -euo pipefail
HANDLE="PT_Transjakarta"
SINCE_ID="${SINCE_ID:-}"            # persist the newest id you have seen
OUTFILE="$(mktemp)"

curl -sS --get "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}" \
  -H "Accept: application/json" \
  --data-urlencode "query=from:${HANDLE} -is:retweet -is:reply" \
  --data-urlencode "max_results=100" \
  --data-urlencode "tweet.fields=created_at,author_id,public_metrics,entities,note_tweet" \
  --data-urlencode "expansions=author_id,attachments.media_keys" \
  --data-urlencode "user.fields=username,verified,name" \
  ${SINCE_ID:+--data-urlencode "since_id=${SINCE_ID}"} \
  -o "$OUTFILE" \
  -w "HTTP %{http_code} in %{time_total}s\n"

# Surface rate-limit headers on the next call
curl -sS -o /dev/null -D - "https://api.x.com/2/usage/tweets" \
  -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}" | grep -i "^x-rate-limit"

python3 - "$OUTFILE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for t in d.get("data",[]):
    print(t["id"], t.get("created_at"), "::", (t.get("text") or "")[:160].replace("\n"," "))
if d.get("meta",{}).get("next_token"):
    print("NEXT_TOKEN", d["meta"]["next_token"])
PY
```

Multi-handle OR variant (one request instead of five) — **verify the parser accepts this before relying on it**:

```bash
curl -sS --get "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}" \
  --data-urlencode "query=(from:PT_Transjakarta OR from:mrtjakarta OR from:lrtjkt OR from:lrtjabodebek OR from:KAI121) -is:retweet -is:reply lang:id" \
  --data-urlencode "max_results=100" \
  --data-urlencode "sort_order=recency" \
  --data-urlencode "tweet.fields=created_at,public_metrics,entities" \
  --data-urlencode "expansions=author_id" \
  --data-urlencode "user.fields=username,name,verified" \
  -w "\nHTTP %{http_code}\n"
```

Resolve handles → IDs once, at boot:

```bash
for h in PT_Transjakarta mrtjakarta lrtjkt lrtjabodebek KAI121; do
  curl -sS "https://api.x.com/2/users/by/username/${h}?user.fields=verified,public_metrics,description" \
    -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}"
  echo
done
```

**Polling design (why this beats streaming for 5 accounts):**
- 5 accounts × 1 request / 5 min = 20 requests/hour = **~1,920 requests/day** against a 450-per-15-min (≈43,200/day) per-app ceiling. Rate limits are a non-issue.
- Cost is driven by *posts read*, not requests, and the **24-hour dedup window** means re-reading the same post within a UTC day is free. Polling the same 5 accounts every 5 minutes therefore costs you roughly **(number of distinct posts/day × $0.005)**, not (requests × $0.005).
- At a realistic ~40–80 operator posts/day across 5 accounts → **$0.20–$0.40/day ≈ $6–12/month**. Cheaper and far more robust than a stream.
- **Use `since_id`** (store the max post id per handle) rather than `start_time`, so you never re-read old posts.
- Alert-window: disruption announcements from operators often land outside peak hours; 5-minute polling means ≤5 min alert latency, which is fine for transit.

#### Option B: Filtered Stream (only if you need sub-minute latency)

```bash
# 1. Add rules (no need to disconnect to change them)
curl -X POST "https://api.x.com/2/tweets/search/stream/rules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}" \
  -d '{
    "add": [
      {"value": "from:PT_Transjakarta -is:retweet", "tag": "tj"},
      {"value": "from:mrtjakarta -is:retweet", "tag": "mrt"},
      {"value": "from:lrtjkt -is:retweet", "tag": "lrtjkt"},
      {"value": "from:lrtjabodebek -is:retweet", "tag": "lrtjb"},
      {"value": "from:KAI121 -is:retweet", "tag": "kai"}
    ]
  }'

# 2. Connect (single persistent connection, 20s keep-alive)
curl -N "https://api.x.com/2/tweets/search/stream?backfill_minutes=5" \
  -H "Authorization: Bearer ${X_APP_BEARER_TOKEN}" \
  -H "Accept: application/json"

# 3. Reconnect with backfill after a drop (≤5 min gaps)
#    curl -N "https://api.x.com/2/tweets/search/stream?backfill_minutes=5" ...
```

Rules-with-OR also works in the stream (`from:a OR from:b -is:retweet`), which lets you use **one rule for all five accounts** instead of five.

**Stream caveats:** 1 connection max on pay-per-use, 1,000 rules/project, no redundancy (Enterprise only), must dedupe posts yourself, and every post read is billed. **Recommendation: start with Option A.** Move to the stream only if you later need <60-second alert latency.

---

## 2. Tavily — news / web search for disruption coverage

### 2.1 Endpoints (all verified live)

Base URL: `https://api.tavily.com` (official OpenAPI spec in the docs declares `servers: - url: https://api.tavily.com/`).

| Endpoint | Method | Purpose | Verified via curl (no key) |
|---|---|---|---|
| `/search` | POST | Web/news search | **HTTP 401** `{"detail":{"error":"Unauthorized: missing or invalid API key."}}` → route exists |
| `/extract` | POST | Fetch + parse page content | **HTTP 422** `{"detail":[{"type":"missing","loc":["body","urls"],...}]}` → route exists |
| `/crawl` | POST | Map + extract a site | **HTTP 422** (missing `url`) → route exists |
| `/map` | POST | Discover URLs on a site | **HTTP 422** (missing `url`) → route exists |
| `/research` | POST | Deep research tasks | **HTTP 422** (missing `input`) → route exists |
| `/usage` | — | Credit usage | **HTTP 405** on POST (it's a GET) → route exists |

### 2.2 Authentication

**Header format: `Authorization: Bearer tvly-YOUR_API_KEY`.**

Verified from the official quickstart (<https://docs.tavily.com/documentation/quickstart.md>):

```bash
curl -X POST https://api.tavily.com/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tvly-YOUR_API_KEY" \
  -d '{"query": "..."}'
```

⚠️ Note the key prefix is **`tvly-`**. Older third-party tutorials show `X-API-Key: tvly-...` — **Tavily's current official docs use `Authorization: Bearer`**, and the 401 response format confirms a Bearer/JSON auth model. I did not find an official page confirming `X-API-Key` is still accepted → treat `X-API-Key` as **UNVERIFIED / probably legacy**.

Tavily also supports **OAuth 2.0** and a **keyless mode** (`/documentation/keyless` — free, rate-limited, no account) for Search and Extract.

### 2.3 `/search` request schema (verified from the official OpenAPI block)

| Param | Type | Default | Notes |
|---|---|---|---|
| `query` | string | — | **required** |
| `search_depth` | enum | `basic` | `advanced` \| `basic` \| `fast` \| `ultra-fast`. **`basic`/`fast`/`ultra-fast` = 1 credit, `advanced` = 2 credits.** |
| `chunks_per_source` | int 1–3 | 3 | Only for `advanced`/`basic`/`fast` |
| `max_results` | int 0–20 | 10 | **Max 20** (note: not 50) |
| `topic` | enum | `general` | `general` \| `news` \| `finance` |
| `time_range` | enum | `null` | `day`\|`week`\|`month`\|`year`\|`d`\|`w`\|`m`\|`y` — **this replaces the old `days` param** |
| `start_date` / `end_date` | `YYYY-MM-DD` | `null` | Absolute window |
| `include_published_date` | bool | `false` | Auto-enabled when `topic: "news"` |
| `filter_by_published_date` | bool | `false` | `true` also enables `include_published_date` and drops undated results |
| `include_answer` | bool \| enum | `false` | `true`/`"basic"` = quick answer; `"advanced"` = detailed |
| `include_raw_content` | bool \| enum | `false` | `markdown`\|`text` |
| `include_images` | bool | `false` | Top-level `images[]` + per-result `images[]` |
| `include_image_descriptions` | bool | `false` | |
| `include_favicon` | bool | `false` | |
| `include_domains` | string[] | `[]` | **Max 300 domains** |
| `exclude_domains` | string[] | `[]` | **Max 150 domains** |
| `include_domains_mode` | enum | `restrict` | `restrict` (hard filter) \| `prefer` (boost, not filter). Setting without `include_domains` → **400**. |
| `country` | enum | — | Boost a country. **Only available when `topic` is `general`.** (No `indonesia` in the enum — **UNVERIFIED** whether Indonesia is selectable.) |
| `language` | string | — | |
| `filter_by_language` | bool | — | |
| `auto_parameters` | bool | — | Let Tavily pick topic/depth |
| `exact_match` | bool | — | |
| `include_usage` | bool | — | Adds a `usage.credits` field |
| `safe_search` | bool | — | |

> ⚠️ **The `days` parameter no longer exists** in the current Tavily API — use `time_range` (`"day"`, `"week"`, `"month"`) or `start_date`/`end_date`. Any tutorial using `days: 3` is out of date.

### 2.4 `/search` response shape (verified from the official OpenAPI response schema)

```json
{
  "query": "who is Leo Messi?",
  "answer": "…",                       // only if include_answer
  "images": [ { "url": "…", "description": "…" } ],
  "results": [
    {
      "title": "Lionel Messi Facts | Britannica",
      "url": "https://www.britannica.com/facts/Lionel-Messi",
      "content": "…short description…",
      "score": 0.81025416,
      "raw_content": null,              // only if include_raw_content
      "published_date": "Tue, 11 Mar 2025 17:00:00 GMT",  // only if include_published_date (auto with topic=news)
      "favicon": "https://britannica.com/favicon.png",
      "images": [ { "url": "…" } ],
      "id": "a3f9c2-04"
    }
  ],
  "auto_parameters": { "topic": "general", "search_depth": "basic" },
  "response_time": 1.67,
  "usage": { "credits": 1 },
  "request_id": "123e4567-e89b-12d3-a456-426614174111"
}
```

Required keys in the response: `query`, `results`, `images`, `response_time`, `answer`.

### 2.5 Other endpoints — key params (verified)

**`/extract`** — `urls` (required, array or string), `query`, `chunks_per_source`, `extract_depth` (`basic` = 1 credit / 5 successful URLs, `advanced` = 2 credits / 5), `include_images`, `include_favicon`, `format` (`markdown`|`text`), `timeout` (1–60 s; default 10 s basic / 30 s advanced), `include_usage`.

**`/crawl`** — `url` (required), `instructions`, `chunks_per_source`, `max_depth` (1–5, default 1), `max_breadth` (1–500, default 20), `limit` (default 50), `select_paths`, `select_domains`, `exclude_paths`, `exclude_domains`, `allow_external` (default `true`), `include_images`, `extract_depth`, `format`, `include_favicon`, `timeout` (10–150 s, default 150).

**`/map`** — `url` (required), `instructions` (raises cost to 2 credits/10 pages vs 1), `max_depth` (1–5, default 1), `max_breadth` (1–500, default 20), `limit` (default 50), `select_paths`, `select_domains`, `exclude_paths`, `exclude_domains`, `allow_external`, `timeout` (10–150 s).

### 2.6 Pricing & rate limits (verified)

**Credits & pricing** (<https://docs.tavily.com/documentation/api-credits.md>):

| Plan | Credits/month | Monthly price | $/credit |
|---|---|---|---|
| **Researcher** | **1,000** | **Free** | — |
| Project | 4,000 | $30 | $0.0075 |
| Bootstrap | 15,000 | $100 | $0.0067 |
| Startup | 38,000 | $220 | $0.0058 |
| Growth | 100,000 | $500 | $0.005 |
| Pay-as-you-go | per usage | — | $0.008 / credit |

"**1,000 free API Credits every month. No credit card required.**" — ✅ verified.

**Credit costs:**
- Search `basic`/`fast`/`ultra-fast` = **1 credit**; `advanced` = **2 credits**
- Extract: **1 credit per 5 successful URLs** (basic), 2 per 5 (advanced). Failed extractions are **not** charged.
- Map: **1 credit per 10 pages**, 2 per 10 with `instructions`
- Crawl = mapping + extraction cost (10 pages basic ≈ 1 + 2 = **3 credits**)
- Research: `model=pro` 15–250 credits/request; `model=mini` 4–110 credits/request

**Rate limits** (<https://docs.tavily.com/documentation/rate-limits.md>):

| Environment | Requests/minute |
|---|---|
| Development key | **100** |
| Production key | **1,000** |

Crawl endpoint: 100 RPM (both). Research task creation: 20 RPM. Usage endpoint: 10 requests / 10 min.
429 response includes a `Retry-After` header. Production keys require an active **Paid Plan or PAYGO**; free keys are "Development" tier.

### 2.7 Best practice for Indonesian-language transit news

**Language.** Use `topic: "news"` with `include_published_date` (auto-enabled for news). For Indonesian sources, put the Indonesian terms **directly in the query** — Tavily is semantic, so Indonesian phrasing retrieves Indonesian articles. Also set `language: "id"` and/or `filter_by_language: true` if you want to hard-filter, and `time_range: "day"` for near-real-time disruption coverage. ⚠️ `country: "indonesia"` is only valid for `topic: "general"`, and the enum I read did not obviously include `indonesia` → **UNVERIFIED**; use `include_domains` instead.

**High-signal Indonesian query vocabulary** (use these in `query` and `include_domains`):

| Indonesian | Meaning |
|---|---|
| `penggantian rute` | route change |
| `penutupan jalan` | road closure |
| `pembatasan layanan` / `pengurangan armada` | service reduction / fleet reduction |
| `penundaan perjalanan` | journey postponement |
| `jadwal baru` / `perubahan jadwal` | new schedule |
| `gangguan exacerbated` → `gangguan layanan` | service disruption |
| `mogok` | breakdown |
| `kebClosed` → `kebocoran`/`insiden` | incident |
| `p-vaccine`… | — |
| `arteri` / `jalan tol` / `underpass` / `flyover` | arterials / toll roads / underpass / flyover |
| `ber(`/closing) → `dib closures` | — |

Concretely: `penggantian rute`, `penutupan jalan`, `pembatasan armada`, `gangguan layanan`, `meninggal dunia`… ignore. Also `jemaah`, `mudik`, `libur nasional` (memperiodic spikes), `pawai` (processions — a recurring cause of TransJakarta corridor closures), `girik`…

**Domain allowlist (put in `include_domains`):**

```
transjakarta.co.id, mrtjakarta.co.id, lrtjakarta.co.id, lrtjabodebek.co.id,
kai.id, commuter.kai.id, dishub.jakarta.go.id, jdi.jakarta.go.id,
kompas.com, detik.com, antaranews.com, tempo.co, cnnindonesia.com,
antaranews.com, mediaindonesia.com, bnnbangkok.com, poskota, jakartaglobe.id
```

**Set `include_domains_mode: "restrict"`** (the default) so `include_domains` is a hard filter, not just a boost. Use `"prefer"` only when you want news-site breadth plus a whitelist boost.

### 2.8 Concrete curl example (Indonesian transit news)

```bash
curl -sS -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TAVILY_API_KEY}" \
  -d '{
    "query": "gangguan layanan transportasi Jakarta penggantian rute penutupan jalan TransJakarta MRT LRT KAI",
    "topic": "news",
    "search_depth": "basic",
    "max_results": 15,
    "time_range": "day",
    "include_published_date": true,
    "filter_by_published_date": true,
    "include_answer": "advanced",
    "include_raw_content": false,
    "include_domains": [
      "transjakarta.co.id", "mrtjakarta.co.id", "lrtjakarta.co.id",
      "lrtjabodebek.co.id", "kai.id", "jdi.jakarta.go.id",
      "kompas.com", "detik.com", "antaranews.com", "tempo.co",
      "cnnindonesia.com", "mediaindonesia.com", "jakartaglobe.id"
    ],
    "include_domains_mode": "restrict",
    "include_usage": true,
    "language": "id"
  }' | python3 -m json.tool
```

Single-domain deep dive (2 credits, richer chunks):

```bash
curl -sS -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TAVILY_API_KEY}" \
  -d '{
    "query": "penggantian rute TransJakarta",
    "topic": "news",
    "search_depth": "advanced",
    "max_results": 10,
    "include_domains": ["transjakarta.co.id"],
    "include_domains_mode": "restrict",
    "include_raw_content": "markdown",
    "include_answer": "advanced"
  }'
```

(Replace the query string above with your own Indonesian query — e.g. `"penggantian rute TransJakarta"`.)

Also useful: `/extract` to pull the full article once Tavily finds it:

```bash
curl -sS -X POST "https://api.tavily.com/extract" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TAVILY_API_KEY}" \
  -d '{"urls":["https://www.transjakarta.co.id/berita/..."],"extract_depth":"basic","format":"markdown","include_usage":true}'
```

---

## 3. OpenRouter — LLM provider for the agent

### 3.1 Base URL, endpoints, auth

Base URL: **`https://openrouter.ai/api/v1`** (official, confirmed in the auth doc).

| Endpoint | Method | Notes |
|---|---|---|
| `/chat/completions` | POST | OpenAI-compatible Chat Completions. **Stateless.** |
| `/responses` | POST | OpenAI-compatible **Responses API**. **Stateless only** — `store: true` and non-null `previous_response_id` are **rejected with HTTP 400**; you must send the full conversation history every request. |
| `/embeddings` | POST | **Confirmed to exist** (see §4). |
| `/models` | GET | Public, **no key required** (verified: HTTP 200, 470 models). |
| `/key` | GET | Returns your credit/limit status (requires key). |
| `/credits` | GET | Credit balance (requires key). |
| `/providers` | GET | Provider routing info. |
| `/endpoints` | GET | Endpoint info. |

**Auth header:** `Authorization: Bearer $OPENROUTER_API_KEY`.

**Optional headers for OpenRouter rankings** (from the official auth doc):
- **`HTTP-Referer`** — your site URL
- **`X-OpenRouter-Title`** — your app title

⚠️ Note the header name is **`X-OpenRouter-Title`**, *not* `X-Title`. The original brief said "X-Title" — the official docs consistently show `X-OpenRouter-Title`. (The `X-Title` form was used by some older third-party examples.) Both are harmless to send; `X-OpenRouter-Title` is the documented one.

### 3.2 Which models support tools / structured outputs

Every model in the live `/models` response carries a `supported_parameters` array. Verified programmatically over the live list:

- **Tool calling** = presence of `"tools"` in `supported_parameters`. **~95% of the 470 live models support it.**
- **Structured outputs** = presence of `"response_format"` (OpenAI-style JSON mode) or `"structured_outputs"` (JSON Schema).
- **Reasoning** = presence of `"reasoning"` / `"reasoning_effort"` / `"include_reasoning"`.

### 3.3 Live model list — curated table (ids exactly as returned by `GET /api/v1/models`)

Fetched live 2026-10-20 (470 models total). Prices are **$ per 1M tokens** (prompt / completion), from each model's `pricing` object.

**Fast & cheap models with tool calling (recommended defaults for the agent):**

| Model id | Context | $ in / M | $ out / M | Tools | Structured | Reasoning |
|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 1,048,576 | 0.10 | 0.40 | ✅ | ✅ | ✅ |
| `qwen/qwen3.5-flash-02-23` | 1,000,000 | 0.065 | 0.26 | ✅ | ✅ | ✅ |
| `qwen/qwen3.7-flash` | 1,000,000 | 0.030 | 0.13 | ✅ | ✅ | ✅ |
| `deepseek/deepseek-v4.1-flash` | 1,048,576 | 0.056 | 0.223 | ✅ | ✅ | ✅ |
| `google/gemini-3.1-flash-lite` | 1,048,576 | 0.25 | 1.50 | ✅ | ✅ | ✅ |
| `mistralai/mistral-small-3.2-24b-instruct` | 256,000 | 0.094 | 0.25 | ✅ | ✅ | ❌ |
| `openai/gpt-5-nano` | 400,000 | 0.050 | 0.40 | ✅ | ✅ | ✅ |
| `openai/gpt-5.4-nano` | 400,000 | 0.20 | 1.25 | ✅ | ✅ | ✅ |
| `openai/gpt-4.1-mini` | 1,047,576 | 0.40 | 1.60 | ✅ | ✅ | ❌ |
| `openai/gpt-4o-mini` | 128,000 | 0.15 | 0.60 | ✅ | ✅ | ❌ |
| `google/gemini-2.5-flash` | 1,048,576 | 0.30 | 2.50 | ✅ | ✅ | ✅ |
| `qwen/qwen3.8-flash` | 1,000,000 | 0.15 | 0.47 | ✅ | ✅ | ✅ |

**Free (`:free` suffix) models confirmed live** — usable for dev, subject to free-tier rate caps:
`minimax/minimax-m3.1-flash:free`, `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, plus `openrouter/free` (router over free models) and `openrouter/auto` (smart router, 2M ctx).

**Strong reasoning models:**

| Model id | Context | $ in / M | $ out / M | Tools | Structured |
|---|---|---|---|---|---|
| `anthropic/claude-sonnet-5.5` | 1,000,000 | 2.00 | 10.00 | ✅ | ✅ |
| `anthropic/claude-opus-4.8` | 1,000,000 | 5.00 | 25.00 | ✅ | ✅ |
| `openai/gpt-6.1-sol` | 1,050,000 | 2.00 | 10.00 | ✅ | ✅ |
| `openai/gpt-5.6-luna` | 1,050,000 | 0.20 | 1.20 | ✅ | ✅ |
| `google/gemini-3.1-pro-preview` | 1,048,576 | 2.00 | 12.00 | ✅ | ✅ |
| `deepseek/deepseek-v4-pro` | 1,048,576 | 0.446 | 0.892 | ✅ | ✅ |
| `x-ai/grok-4.20` | 2,000,000 | 1.25 | 2.50 | ✅ | ✅ |

> ⚠️ **The ids in the original brief (`anthropic/claude-sonnet-4`, `openai/gpt-4o-mini`, `google/gemini-2.5-flash`) are stale.** `openai/gpt-4o-mini` and `google/gemini-2.5-flash` still exist in the live list; **`anthropic/claude-sonnet-4` does NOT** — the current Anthropic line is `claude-sonnet-4.5` → `4.6` → `claude-sonnet-5` → `claude-sonnet-5.5`. Always resolve ids from `GET /api/v1/models` at runtime rather than hard-coding.

**Batch variants** (`:batch` suffix) are ~50% cheaper for non-urgent work — e.g. `anthropic/claude-sonnet-5.5:batch` at $1.00/$5.00, `openai/gpt-5-nano:batch` at $0.025/$0.20.

### 3.4 `/models` endpoint

```bash
curl -sS "https://openrouter.ai/api/v1/models" -H "Accept: application/json"
```

**No API key required** (verified HTTP 200, 789 KB). Response shape: `{"data": [ { id, canonical_slug, name, created, description, context_length, architecture{...}, pricing{prompt,completion,image,request,...}, top_provider{...}, per_request_limits, supported_parameters[] }, ... ]}`.

### 3.5 Streaming format & how tool calls are streamed

**Transport:** standard **SSE** (`text/event-stream`). Lines are `data: {json}`. The stream terminates with the sentinel **`data: [DONE]`**. OpenRouter also sends **SSE comment lines** (starting with `:`) as keep-alives — per spec these are safe to ignore.

**Content streaming:** each chunk is a `chat.completion.chunk`; read `choices[0].delta.content`.

**Tool calls are streamed incrementally**, exactly like OpenAI: the first chunk carrying a tool call has
`delta.tool_calls: [{ index: 0, id: "call_xxx", type: "function", function: { name: "search_alerts", arguments: "" } }]`
and subsequent chunks append to `delta.tool_calls[0].function.arguments` as a **partial JSON string**. You must buffer the `arguments` string until `finish_reason: "tool_calls"` and then `JSON.parse` it. *(Tool-call streaming shape follows the OpenAI spec; I did not fetch OpenRouter's dedicated tool-calling page — it 404'd at `/docs/features/tool-calling.md` — so the exact field-level confirmation is **UNVERIFIED**, but the documented streaming doc covers `choices[0].delta` and the standard chunk envelope.)*

**Final usage chunk (important OpenRouter deviation):** on `/chat/completions`, every stream ends with an extra chunk carrying `usage`, sent just before `[DONE]`. OpenAI emits that chunk with an **empty `choices` array**; OpenRouter intentionally emits **one choice with a content-free `delta` that repeats `finish_reason`**. So `finish_reason` appears **twice** (once on the last content chunk, once on the usage chunk). Clients that do `chunk.choices[0].delta` on the usage chunk are safe on OpenRouter but would crash on raw OpenAI.

```
data: {"id":"gen-abc123",...,"choices":[{"index":0,"delta":{"content":"","role":"assistant"},"finish_reason":"stop","native_finish_reason":"stop"}],"usage":{...}}
data: [DONE]
```

**Other endpoints:** the Responses API reports usage in the **`response.completed`** event; the Anthropic Messages API (`/api/v1/messages`) reports it in **`message_delta`** before `message_stop`.

**Mid-stream errors:** after HTTP 200 is committed, errors arrive as SSE with `finish_reason: "error"`:

```
data: {"id":"cmpl-abc123",...,"error":{"code":429,"message":"Rate limit exceeded"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

**Cancellation:** the streaming doc has a "Stream cancellation" section (abort the fetch / close the response body).

### 3.6 Rate limits & how OpenRouter reports credits

Source: <https://openrouter.ai/docs/api_reference/limits.md>.

**Key insight: OpenRouter has no blanket per-minute request limit for paid models.** Limits are governed by *credits*, and the only hard platform cap is on **free-model variants** (`<model>:free`):

| Credits purchased (all time) | Requests / minute | Requests / day |
|---|---|---|
| Less than the free-model credits threshold | (templated value `FREE_MODEL_RATE_LIMIT_RPM`) | `FREE_MODEL_NO_CREDITS_RPD` |
| At least the threshold | `FREE_MODEL_RATE_LIMIT_RPM` | `FREE_MODEL_HAS_CREDITS_RPD` |

⚠️ **These exact numbers are template placeholders in the published docs** (`{FREE_MODEL_RATE_LIMIT_RPM}`, `{FREE_MODEL_NO_CREDITS_RPD}`, `{FREE_MODEL_HAS_CREDITS_RPD}`, `{FREE_MODEL_CREDITS_THRESHOLD}`) — the literal values are **not in the markdown I fetched**. **UNVERIFIED.** Read them live from `GET /api/v1/key` → `free_model_daily_requests.{remaining,limit}`.

Other platform limits:
- **DDoS protection** (Cloudflare) blocks requests that dramatically exceed reasonable usage.
- **Upstream provider rate limits** can also produce 429s; OpenRouter's **fallback routing** automatically retries other providers for the same model before the error reaches you, and you can configure **fallback models** explicitly.

**Credits / budget reporting:**

```bash
curl -sS "https://openrouter.ai/api/v1/key" -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Returns:
- `data.limit` (credit limit), `data.limit_remaining`, `data.usage` (all-time credits used), `data.usage_daily` (current UTC day), `data.is_free_tier`
- `data.free_model_daily_requests.{remaining, limit}`
- `data.effective_budget` — a `Budget` object: `{ scope, budget_id, limit_usd, spend_usd, remaining_usd, reset_interval: 'daily'|'weekly'|'monthly'|null, resets_at, include_byok }`
- `data.total_credits` (account balance)

**Credit limits are three nested things** (from the Limits doc):
1. **Account balance** — if negative, you get **HTTP 402 Payment Required**, *including for free models*.
2. **Per-key credit limit** — set on the key page; `limit_source: "openrouter_key_limit"`.
3. **In-flight spending budget** — a fraction of your balance (capped) that running requests count against. If a single request's estimated cost exceeds the whole budget, you get 402 with `"reason": "weight_exceeds_budget"` and `"limit_source": "openrouter_credits"` — **retrying will not help**; lower `max_tokens` or add credits. Does **not** apply to free models, BYOK, enterprise, or invoice-billed accounts.

**402 handling:** branch on `error.metadata.limit_source` (`openrouter_in_flight_budget` | `openrouter_key_limit` | `openrouter_credits`), not on the message text. Each 402 with a `limit_source` also carries a one-line `remedy_hint`.

**429 handling:** OpenRouter only returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers **on the error response** — successful inference responses do **not** include them. Poll `GET /api/v1/key` to monitor quota. Honor `Retry-After` when present.

**Key hygiene (official advice):** set a credit limit on every key; onboarding keys get **$100** credit limit and expire after **180 days**.

### 3.7 Working curl examples

```bash
# Chat completion (non-streaming)
curl -sS "https://openrouter.ai/api/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://dailyroute.id" \
  -H "X-OpenRouter-Title: DailyRoute" \
  -d '{
    "model": "google/gemini-2.5-flash-lite",
    "messages": [
      {"role":"system","content":"You are a Jakarta transit disruption summarizer. Reply in Bahasa Indonesia."},
      {"role":"user","content":"Ringkas dalam 1 kalimat: Rute 5 Koridor eastward dialihkan lewat Jalan Meadowsweet."}
    ]
  }'

# Streaming
curl -sN "https://openrouter.ai/api/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://dailyroute.id" \
  -H "X-OpenRouter-Title: DailyRoute" \
  -d '{"model":"google/gemini-2.5-flash-lite","stream":true,"messages":[{"role":"user","content":"Summarize the disruption."}]}'

# Tool calling + strict JSON schema (structured outputs)
curl -sS "https://openrouter.ai/api/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [{"role":"user","content":"Ada gangguan di Koridor 1. Klasifikasikan."}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "classify_disruption",
        "description": "Classify a Jakarta transit disruption",
        "parameters": {
          "type": "object",
          "properties": {
            "mode":    {"type":"string","enum":["busway","mrt","lrt","rail","road","unknown"]},
            "severity":{"type":"string","enum":["info","delay","partial","suspended"]},
            "routes":  {"type":"array","items":{"type":"string"}}
          },
          "required": ["mode","severity","routes"],
          "additionalProperties": false
        }
      }
    }],
    "tool_choice": "auto",
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "disruption",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "mode":    {"type":"string","enum":["busway","mrt","lrt","rail","road","unknown"]},
            "severity":{"type":"string","enum":["info","delay","partial","suspended"]},
            "routes":  {"type":"array","items":{"type":"string"}}
          },
          "required": ["mode","severity","routes"],
          "additionalProperties": false
        }
      }
    }
  }'

# Responses API (stateless)
curl -sS -X POST "https://openrouter.ai/api/v1/responses" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-5.6-luna","input":"Hello, world!"}'

# Credit / limit status
curl -sS "https://openrouter.ai/api/v1/key" -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

---

## 4. Embeddings for semantic place resolution

### 4.1 Does OpenRouter have `/embeddings`? — **YES, confirmed**

- Docs page exists and is live: <https://openrouter.ai/docs/api_reference/embeddings> (HTTP 200, 24 KB markdown fetched).
- The route exists server-side: `POST https://openrouter.ai/api/v1/embeddings` without a key returns **HTTP 401** `{"error":{"message":"No cookie auth credentials found","code":401}}` — i.e. it is a real route gated by auth (not a 404).
- Official example model: **`openai/text-embedding-3-small`**.
- Official example image-embedding model: **`nvidia/llama-nemotron-embed-vl-1b-v2`**.

⚠️ **Important:** embedding models are **not present in the public `GET /api/v1/models` list** — I checked all 470 entries and **zero** have `embed` in the id or name, and none have `output_modalities` containing `embeddings`. So you **cannot** discover valid embedding model ids from `/api/v1/models`. The only ids confirmed by official docs are the two above. **All other embedding model ids are UNVERIFIED.**

### 4.2 Exact request shape (from the official docs)

```bash
curl https://openrouter.ai/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

Batch (array of strings → array of embeddings):

```bash
curl https://openrouter.ai/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": [
      "Machine learning is a subset of artificial intelligence",
      "Deep learning uses multiple layers",
      "Natural language processing enables computers to understand text"
    ]
  }'
```

Multimodal (text + image) embedding:

```bash
curl https://openrouter.ai/api/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
    "model": "nvidia/llama-nemotron-embed-vl-1b-v2",
    "input": [
      {"content": [{"type":"image_url","image_url":{"url":"https://example.com/halte.jpg"}}]}
    ],
    "encoding_format": "float"
  }'
```

**Response shape** (from the docs' Python sample): `data[0].embedding` is a `float[]`; `len(data[0].embedding)` is the dimension. The endpoint is OpenAI-compatible, so the envelope is `{"object":"list","data":[{"object":"embedding","index":0,"embedding":[...]}],"model":"...","usage":{...}}` — the envelope details beyond `data[].embedding` are **UNVERIFIED** (no key to test against).

### 4.3 Alternatives (for place resolution specifically)

| Option | Key needed | Notes |
|---|---|---|
| **OpenRouter `/embeddings`** (`openai/text-embedding-3-small`) | OpenRouter key | ✅ endpoint + model confirmed. Embeddings are billed per token like any other call — **pricing for embedding models is NOT in the `/models` list** → **cost UNVERIFIED**. |
| **OpenAI `POST /api/v1/embeddings`** (`text-embedding-3-small`, `text-embedding-3-large`) | OpenAI key | OpenAI-compatible; OpenRouter's `openai/text-embedding-3-small` is an OpenAI-backed model, so the same client code works. |
| **Google Gemini** (`text-embedding-004`, `gemini-embedding-001`) | Google key | Not in the OpenRouter `/models` list either. |
| **`sentence-transformers` / `fastembed` / `gte-multilingual-base`** self-hosted | ❌ none | For Indonesian place names, **`gte-multilingual-base`** or **`intfloat/multilingual-e5-large`** are far better than `text-embedding-3-small` (which is English-centric). Runs on CPU/GPU, zero per-call cost. |
| **Deterministic fallback: fuzzy/lexical matching** | ❌ none | For place resolution, a well-tuned **token + Levenshtein + alias table** over the ~10k TransJakarta/KAI stop names is likely to beat a general embedding model, and it's free, instant, and debuggable. |

**Recommendation for "semantic place resolution":** use **embeddings only as a fallback re-ranker** behind exact/alias/fuzzy matching, and prefer a multilingual model (self-hosted `gte-multilingual-base` or a verified multilingual OpenRouter embedding model) rather than `text-embedding-3-small`, which is optimized for English and will handle names like *"Halte Bundaran Senayan"* and *"Stasiun Gambir"* poorly.

---

## 5. Official Indonesian transit open data / GTFS sources

Every URL below was probed with `curl` from this environment on 2026-10-20. **Dead / blocked URLs are reported as such — nothing is claimed that I did not observe.**

### 5.1 Summary table

| URL | HTTP | Content-Type | Auth | Verdict |
|---|---|---|---|---|
| `https://api.transjakarta.co.id/v3/` | **000** | — | — | ❌ **Connection refused** (DNS resolves to 103.145.125.20, TCP 80 & 443 refused) |
| `https://api.transjakarta.co.id/v3/routes` | **000** | — | — | ❌ same |
| `https://api.transjakarta.co.id/v3/bus` | **000** | — | — | ❌ same |
| `https://gtfs.transjakarta.co.id/` | **200** | `text/html` | **Yes (NIK)** | ⚠️ Login-gated **GTFS upload portal** (operator-facing), not a public feed |
| `https://www.transjakarta.co.id/gtfs` | **200** | `text/html` | No | ⚠️ Landing page with **no GTFS download links** (news/corporate nav only) |
| `https://data.kai.id/` | **000** | — | — | ❌ **NXDOMAIN — domain does not resolve at all** |
| `https://gtfs.kai.id/` | **000** | — | — | ❌ **NXDOMAIN** |
| `https://data.kai.id/gtfs` | **000** | — | — | ❌ **NXDOMAIN** |
| `https://data.kai.co.id/` | **200** | `text/html` | No | ❌ **Parked domain "for sale"** — not KAI data |
| `https://api.kai.id/` | **404** | `application/json` | No | ⚠️ **Server exists and speaks JSON!** `{"message":"no route and no API found with those values"}` — but I could not discover a valid route |
| `https://api.mrtjakarta.co.id/` | **000** | — | — | ❌ **DNS SERVFAIL — does not exist** |
| `https://gtfs.mrtjakarta.co.id/` | **000** | — | — | ❌ **DNS SERVFAIL — does not exist** |
| `https://jakarta.lrtjabodebek.co.id/` | **000** | — | — | ❌ **NXDOMAIN** |
| `https://www.lrtjabodebek.co.id/` | **000** | — | — | ❌ unreachable from here |
| `https://www.lrtjakarta.co.id/` | **200** | `text/html` | No | ✅ Live corporate site (no public API found) |
| `https://api.lrtjakarta.co.id/` | **526** | `text/plain` | — | ❌ **Cloudflare error 526: invalid SSL certificate on origin** — host resolves (104.21.87.254) but TLS to origin is broken |
| `https://data.go.id/` | **200** | `text/html` | No | ✅ Live (Next.js app). Dataset pages + CSV exports work |
| `https://satudata.jakarta.go.id/backend/restapi/v1/datasets/export/...` | **200** | `text/csv` | **No** | ✅ **Works, key-free, real data** — best Jakarta open-data source found |
| `https://satudata.jakarta.go.id/backend/restapi/v1/datasets?...` | **401** | `application/json` | **Yes** | `{"message":"Header X-Api-Key atau query parameter api_key diperlukan"}` |

### 5.2 `api.transjakarta.co.id` — dead

DNS resolves to `103.145.125.20` but **TCP connection is refused on both 443 and 80**. Curl verbose output:

```
* Host api.transjakarta.co.id:443 was resolved.
* IPv4: 103.145.125.20
* connect to 103.145.125.20 port 443 from 192.168.1.103 port 51228 failed: Connection refused
```

This is the historical home of the TransJakarta `/v3/` REST API (routes, buses, stops, arrivals). **As of 2026-10-20 it is not serving.** ⚠️ It may be geo/IP-restricted or temporarily down — **UNVERIFIED** whether it works from inside Indonesia. **Do not build against it.** Plan a fallback.

### 5.3 `gtfs.transjakarta.co.id` — a login-gated **upload** portal, not a download

The page is a login form: *"Silakan gunakan NIK Anda sebagai kata sandi"* ("use your NIK [national ID number] as the password"). It is the **operator-side GTFS submission portal**, not a public GTFS download. Requiring a NIK means it is **not usable as a public data source** (and asking users for their national ID number to read a map would be inappropriate).

### 5.4 `www.transjakarta.co.id/gtfs` — no downloads

Returns the corporate landing page (Beranda / Layanan / Galeri / Rute / Berita / Keberlanjutan / Komersial …). I extracted every `href`/`src` matching `gtfs|api|zip|static|data` — **zero matches**. There is no GTFS bundle link on that page.

### 5.5 KAI — `data.kai.id` does not exist; `api.kai.id` exists but I couldn't route it

- `data.kai.id`, `gtfs.kai.id` → **NXDOMAIN**. These hostnames in the brief **do not exist**.
- `data.kai.co.id` → a **parked "domain for sale" page** (Sedo). Not KAI.
- `www.kai.id` → 200 and live; footer links to `https://twitter.com/KAI121`. No data/GTFS link found in the homepage HTML.
- **`api.kai.id` returns JSON**: `{"message":"no route and no API found with those values"}` on every path I tried (`/`, `/v1/`, `/v2/`, `/api/`, `/routes`, `/stops`, `/schedules`, `/swagger`, `/openapi.json`, `/docs`). The error string ("no route and no API found with those values") is characteristic of a **GoFiber** router. **The valid route names are UNVERIFIED** — the real paths are probably Indonesian-language (e.g. `/jadwal`, `/stasiun`, `/jadwal/:id`) and are used by the KAI web/app front end. **Next step: open `kai.id` in a browser, open DevTools → Network → XHR, and read the real paths.** (I could not do that in this environment.)
- ⚠️ **UNVERIFIED:** whether KAI publishes any public GTFS feed at all, and under what URL.

### 5.6 MRT / LRT — no public APIs or GTFS hosts

- `api.mrtjakarta.co.id` and `gtfs.mrtjakarta.co.id` → **DNS SERVFAIL**. These hostnames **do not exist**.
- `mrtjakarta.co.id` (www) → unreachable from this environment (HTTP 000).
- `jakarta.lrtjabodebek.co.id` → **NXDOMAIN**; `www.lrtjabodebek.co.id` → unreachable.
- `www.lrtjakarta.co.id` → 200, live (121 KB HTML), corporate site; no API endpoints found.
- `api.lrtjakarta.co.id` → resolves (Cloudflare 104.21.87.254) but returns **HTTP 526** — Cloudflare's "invalid SSL certificate on origin" error. The origin's cert is broken; not usable from here.

**Conclusion: there is currently no working public GTFS or JSON API for TransJakarta, MRT Jakarta, LRT Jabodebek, or KAI that I could verify.**

### 5.7 `data.go.id` — works; dataset titles + download links

`data.go.id` is now a Next.js app. The old `/api/v1/datasets` REST paths are **404**; the working pattern is:
- Catalog page: `https://data.go.id/dataset?q=<query>` and `https://data.go.id/dataset?topik=<Topic>`
- Dataset page: `https://data.go.id/dataset/dataset/<slug>`
- **Download:** the CSV lives on `satudata.jakarta.go.id`:
  `https://satudata.jakarta.go.id/backend/restapi/v1/datasets/export/<dataset-uuid>/<slug>.csv` — **no API key required** (verified HTTP 200, `text/csv`).
- The satudata **dataset search/list API** does require a key: `GET https://satudata.jakarta.go.id/backend/restapi/v1/datasets?...` → **HTTP 401** `{"message":"Header X-Api-Key atau query parameter api_key diperlukan"}`. You can request a key at <https://satudata.jakarta.go.id>.

**Relevant datasets found (titles as returned by the pages, with working CSV links):**

| Dataset title | data.go.id slug | CSV download (verified) |
|---|---|---|
| **Data Jumlah Bus Operator PT Transportasi Jakarta** | `data-jumlah-bus-operator-pt-transportasi-jakarta` | `https://satudata.jakarta.go.id/backend/restapi/v1/datasets/export/77d38e08c0c7911aecafae72b0daa6e2/data-jumlah-bus-operator-pt-transportasi-jakarta.csv` |
| **Data Angkutan Massal Bus Rapid Transit** | `data-angkutan-massal-bus-rapid-transit` | `.../export/d75624a142edb8de138f069cbcb24259/data-angkutan-massal-bus-rapid-transit.csv` |
| **Data Jumlah Penumpang Mass Rapid Transit (MRT)** | `data-jumlah-penumpang-mass-rapid-transit-mrt` | `.../export/59c67080082e37ba05f88b81fc0fb341/data-jumlah-penumpang-mass-rapid-transit-mrt.csv` |
| **Data Stasiun Mass Rapid Transit (MRT)** | `data-stasiun-mass-rapid-transit-mrt` | `.../export/d240b15a9b61c1a64d31bef8f0b4c8c2/data-stasiun-mass-rapid-transit-mrt.csv` |
| **Jumlah Penumpang Light Rail Transit (LRT) Jakarta, Bogor, Depok, Tangerang, dan Bekasi (Jabodebek) Menurut Bulan** | `jumlah-penumpang-light-rail-transit-lrt-jakarta-bogor-depok-tangerang-dan-bekasi-jabodebek-menu` | `.../export/d1da4a0f584c820c4967a4e1213bd9ed/jumlah-penumpang-light-rail-transit-lrt-jakarta-bogor-depok-tangerang-dan-bekasi-jabodebek-menurut-bulan.csv` |
| **Penilaian Kinerja Jak Lingko Dibandingkan Transportasi Lainnya** | `penilaian-kinerja-jak-lingko-dibandingkan-transportasi-lainnya` | page only |
| **Persentase Perjalanan Penduduk Menggunakan Moda Transportasi Publik** | `persentase-perjalanan-penduduk-menggunakan-moda-transportasi-publik` | page only |
| **Rasio Jalur Pedestrian yang Dilengkapi Fasilitas Pendukung pada Lokasi Transportasi Massal** | `rasio-jalur-pedestrian-yang-dilengkapi-fasilitas-pendukung-pada-lokasi-transportasi-massal` | page only |
| **Persentase Kesesuaian Kegiatan Pemanfaatan Ruang di Sistem Pusat Pelayanan Berorientasi Transit** | `persentase-kesesuaian-kegiatan-pemanfaatan-ruang-di-sistem-pusat-pelayanan-berorientasi-transit` | page only |

**The MRT-stations CSV is genuinely useful** — real station coordinates. Verified sample:

```
periode_data,wilayah,kecamatan,kelurahan,nama_stasiun,lokasi,koordinat_x,koordinat_y
2024,"Kota Adm. Jakarta Selatan","Kebayoran Lama","Pondok Pinang","Lebak Bulus","Jalan Pasar Jumat, Kel. Pd. Pinang Kec. Kby. Lama dan Kel. Lebak Bulus Kec. Cilandak ...",-6.289286,106.774942
2024,"Kota Adm. Jakarta Selatan",Cilandak,Cilandak,Fatmawati,"Jalan Raden Ajeng Kartini RT. 1/RW. 4, ...",-6.292465,106.792503
2024,"Kota Adm. Jakarta Selatan","Cilandak","Gandaria Selatan","Cipete Raya","Jalan RS Fatawati 15, ...",...
```

27 lines total (26 MRT stations + header) — exactly the right shape for seeding a transit map.

**⚠️ Limitation:** these are **periodic/statistical datasets** (annual ridership, station lists, bus counts) — **not real-time positions and not a GTFS schedule**. `data.go.id` had **no GTFS datasets** (search for "gtfs" returned zero dataset links).

### 5.8 OSM as the practical transit-data backbone (verified working)

| Service | Endpoint | Verified |
|---|---|---|
| **Nominatim** (geocoding / place search) | `https://nominatim.openstreetmap.org/search?q=Halte+Lebak+Bulus&format=json&limit=2` | ✅ **HTTP 200**, returns the OSM way with lat/lon: `{"place_id":30888069,"osm_type":"way","osm_id":1239255161,"lat":"-6.2894193","lon":"106.7740091","class":"building","type":"transportation","name":"Halte Lebak Bulus",...}` — **Indonesian stop names geocode correctly.** |
| Nominatim status | `https://nominatim.openstreetmap.org/status` | ✅ 200 |
| **Overpass API** (POI/route queries) | `https://overpass-api.de/api/interpreter` | ⚠️ **HTTP 502 "server is currently at capacity"** at test time |
| Overpass mirror (CH) | `https://overpass.osm.ch/api/interpreter` | ✅ **HTTP 200**, valid Overpass JSON |
| Overpass mirror (DE, `z.`) | `https://z.overpass-api.de/api/interpreter` | ✅ **HTTP 200**, `timestamp_osm_base: 2026-10-20T13:13:20Z` |
| Overpass mirror (JP) | `https://overpass.osm.jp/api/interpreter` | ⚠️ HTTP 000 from here |
| **OSM standard tiles** | `https://tile.openstreetmap.org/13/6713/3034.png` | ✅ **HTTP 200, `image/png`, 6,987 bytes** |
| OSM API capabilities | `https://api.openstreetmap.org/api/0.6/capabilities` | ✅ 200 |

Working Overpass query (Jakarta bus stops) — POST to `/api/interpreter`:

```bash
curl -sS -X POST "https://z.overpass-api.de/api/interpreter" \
  -H "User-Agent: daily-route/1.0 (you@example.com)" \
  --data-urlencode 'data=[out:json][timeout:20];node["highway"="bus_stop"](-6.30,106.76,-6.20,106.84);out 5;'
```

Returns `{"version":0.6,"generator":"Overpass API 0.7.62.11 ...","osm3s":{"timestamp_osm_base":"2026-10-20T13:13:20Z",...},"elements":[...]}`.

### 5.9 OSM tile usage policy (verified from <https://operations.osmfoundation.org/policies/tiles/>)

**You must:**
- Use the exact URL `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- Provide **visible licence attribution**
- Send a **valid HTTP User-Agent** that identifies your application (and a valid `Referer` from web pages)
- Cache tiles per HTTP caching headers (or ≥7 days)
- **Must not:** bulk download / scrape tiles, pre-seed large areas, build tile archives (`.zip`, `.mbtiles`), automated scans across wide bounding boxes at high zoom (z≥14), headless bots that pan/zoom to force rendering, or offer prefetching

"Traffic using generic defaults, referer-stripping, or spoofed identities may be blocked without notice."

➡️ **Do not use `tile.openstreetmap.org` in production for a transit app.** Use OpenFreeMap (§6) which is built for this.

---

## 6. Map rendering

### 6.1 Comparison

| Option | API key? | Cost | Vector styling | Offline | Best for |
|---|---|---|---|---|---|
| **MapLibre GL JS + OpenFreeMap** | ❌ **No key** | **$0**, unlimited on the public instance | ✅ Full Mapbox-style GL styles | ✅ (≤3,000 tiles / 50 MB per download, ≤4 parallel requests, unique UA) | **This app.** Zero-friction, zero vendor lock-in, OSM data. |
| MapLibre GL JS + Protomaps | ✅ key optional | Free tier + paid | ✅ | ✅ (self-host tiles) | If you need a richer basemap (Protomaps basemaps are a paid product with a free self-host option). |
| **MapTiler** | ✅ **key required** | Free $0 tier — but "**testing, PoC, prototyping, personal, or non-commercial use**" only; **Flex $30/mo** for commercial | ✅ Vector + raster + WMTS | ❌ | If you need geocoding + routing + tiles from one vendor and can pay. |
| **Stadia Maps** | ✅ **key required** | Free $0 = **200,000 credits/month, "Commercial use not allowed"**; Starter $20/mo (1M credits) allows commercial | ✅ Vector + raster | ❌ | Good commercial-friendly cheap tiles + geocoding. |
| **Mapbox** | ✅ **key required** | Free tier exists but "map load" is metered and billed after the free tier | ✅ Best-in-class styling | ❌ | Expensive for what this app needs; the free tier's non-commercial terms are restrictive. |
| **Leaflet** (raster) | depends on tile source | — | ❌ Raster only (image tiles) | ❌ | Simple, tiny, ubiquitous — but no vector styling, so transit lines look worse and there's no offline vector story. |

### 6.2 OpenFreeMap — verified, fully key-free (recommended)

**Verified live on 2026-10-20:**

| Resource | Result |
|---|---|
| `https://tiles.openfreemap.org/styles/liberty` | **HTTP 200**, `application/json`, 43,079 bytes (MapLibre Style v8) |
| `https://tiles.openfreemap.org/styles/positron` | **HTTP 200**, `application/json`, 25,153 bytes |
| `https://tiles.openfreemap.org/styles/bright` | **HTTP 200**, `application/json`, 48,713 bytes |
| `https://tiles.openfreemap.org/styles/fiord` | **HTTP 200**, `application/json`, 22,234 bytes |
| `https://tiles.openfreemap.org/planet` (TileJSON) | **HTTP 200**, `application/json` → `{"tilejson":"3.0.0","tiles":["https://tiles.openfreemap.org/planet/20261018_080001_pt/{z}/{x}/{y}.pbf"],"vector_layers":[...]}` |
| `https://tiles.openfreemap.org/planet/14/12345/9085.pbf` | **HTTP 200**, `application/vnd.mapbox-vector-tile` |

Style JSON structure (verified):

```json
{"version":8,
 "sources":{"ne2_shaded":{"maxzoom":6,"tileSize":256,"tiles":["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"],"type":"raster"},
            "openmaptiles":{"type":"vector","url":"https://tiles.openfreemap.org/planet"}},
 "sprite":"https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
 "glyphs":"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
 "layers":[...]}
```

Official claims (<https://openfreemap.org/>):
- "Using our **public instance** is completely free: there are **no limits** on the number of map views or requests. There's **no registration, no user database, no API keys, and no cookies**."
- Commercial usage **allowed**. MIT license. Data © OpenStreetMap, schema = unmodified OpenMapTiles.
- "If you are using MapLibre, they [attribution] are automatically added, you have nothing to do."
- Required attribution for non-MapLibre clients: `OpenFreeMap © OpenMapTiles, Data from OpenStreetMap`
- **Offline:** "as long as each download is at most **3,000 tiles or 50 MB**, uses at most **4 parallel requests**, and sends a **unique User-Agent** identifying your app."
- **No SLA / no personalized support**; donations fund the running costs. Self-hosting is available (weekly full-planet Btrfs and MBTiles dumps; Planetiler-based).

### 6.3 MapTiler (verified)

<https://www.maptiler.com/cloud/pricing/>:
- **Free — $0**, no credit card needed. Features: vector & XYZ raster tiles, MapTiler logo on the map, 2D/3D data support (incl. Gaussian Splats), 5 GB storage (1 file limit). *"Suitable for **testing, PoC, prototyping, personal, or non-commercial use**."*
- **Flex — $30/month** USD, extra traffic billed monthly: vector/raster/WMTS, static maps API, high-DPI exports, 10 GB storage (scalable).
- ⚠️ The exact **tile quota numbers for each plan were not visible in the text I extracted** (the page's counters are JS-rendered) → **UNVERIFIED**. Check <https://cloud.maptiler.com/>.
- SDK: `@maptiler/sdk` (v4.2.0), `@maptiler/client` (v3.1.0) — both verified on npm.

### 6.4 Stadia Maps (verified)

<https://stadiamaps.com/pricing/>:

| Plan | $/month | Credits | Commercial use |
|---|---|---|---|
| **Free** | $0 | **200,000 credits/month** | ❌ **not allowed** |
| Starter | $20 | 1,000,000 | ✅ |
| Standard | $80 | 7,500,000 | ✅ |
| Professional | $250 | 25,000,000 | ✅ |

Credit costs: **Standard Vector Basemaps = 1 credit/tile**, Standard Raster = 1/tile, Satellite = 4/tile, Static Maps = 20/req, Cacheable Static Maps = 2,000/req.
Also: 14-day Professional trial, no credit card, and "your account will remain on your free plan after your trial."
⚠️ **No `@stadiamaps/*` npm package exists** — I checked 6 name variants, all 404. Stadia is consumed via `maplibre-gl` + their style/tile URLs.

### 6.5 Mapbox (verified, partially)

<https://www.mapbox.com/pricing> renders the **Navigation** section server-side; the **Maps** section is JS-driven. I confirmed from the page HTML: *"A map load occurs whenever a Map object is initialized, offering users unlimited interactivity with your web map."* — i.e. Mapbox meters **map loads**, not tiles.
⚠️ **The Maps free-tier allowance (map loads/month) was NOT retrievable** from the rendered page → **UNVERIFIED**. Mapbox requires a key and a payment method; its terms restrict commercial use of the free tier. npm `mapbox-gl` v3.33.0 verified.
➡️ **Not recommended here** — you pay for map *initializations*, which is exactly the wrong unit for a transit app that opens the map repeatedly.

### 6.6 Leaflet

npm `leaflet` **1.9.4**, license **BSD-2-Clause** (verified via registry). Raster-only — no vector tiles, no GL styling. Fine for a simple marker map, wrong for a styled transit network.

### 6.7 Indonesian-friendly overlay sources

| Source | Key? | Verified | Use |
|---|---|---|---|
| **OpenStreetMap (Overpass + Nominatim)** | ❌ | ✅ Nominatim 200 (geocodes "Halte Lebak Bulus" correctly); Overpass mirrors 200 (`z.overpass-api.de`, `overpass.osm.ch`); `overpass-api.de` was at capacity | **Primary overlay**: bus stops (`highway=bus_stop`), MRT/LRT/KAI `public_transport=station/platform`, route relations (`type=route`, `route=bus|light_rail|subway|train`), `operator`, `ref` (route numbers like "1", "Tj1") |
| **TransJakarta / KAI / MRT GTFS** | — | ❌ none publicly reachable | Would be ideal but **not available** — see §5 |
| **`data.go.id` / satudata.jakarta.go.id** | ❌ (CSV export) | ✅ CSV 200 | Static reference data: MRT station coords, bus counts, ridership |
| **Google Maps JS API** | ✅ | not probed | Fine as a *user-facing* map, but **bad as a data source** and costly; do not depend on it for geometry |
| **HERE / TomTom** | ✅ | not probed | Commercial, good Jakarta coverage — paid |
| **Mapillary / KartaView** | ❌ (public API w/ token) | not probed | Street-level imagery for disruption verification |
| **BPS (bps.go.id)** | ❌ for most tables | not probed | Jakarta-area statistics (macro, not real-time) |

**Key insight:** OSM has **excellent Indonesian transit coverage** (Jakarta bus stops, MRT/LRT/KAI platforms and route relations are densely mapped) and the **Nominatim + Overpass** stack is key-free. Use it as the geometry source, and layer **your own X/Tavily-derived disruption annotations** on top.

### 6.8 Final recommendation — exact npm packages

**Recommended stack: MapLibre GL JS + OpenFreeMap + React.**

```bash
npm install maplibre-gl react-map-gl
```

| Package | npm | Version verified | License | Why |
|---|---|---|---|---|
| **`maplibre-gl`** | `maplibre-gl` | **6.15.0** | **BSD-3-Clause** | The renderer. GL/vector, full style control, no key, no vendor. |
| **`react-map-gl`** | `react-map-gl` | **8.1.3** | **MIT** | React bindings for MapLibre. (v8 supports MapLibre — set `mapLib={maplibregl}`.) |
| `leaflet` | `leaflet` | 1.9.4 | BSD-2-Clause | Fallback only |
| `react-leaflet` | `react-leaflet` | 5.0.0 | **Hippocratic-2.1** | ⚠️ non-OSI license — avoid unless needed |
| `@maplibre/maplibre-gl-leaflet` | `@maplibre/maplibre-gl-leaflet` | 0.1.4 | ISC | Vector tiles inside a Leaflet map, if you must stay on Leaflet |
| `@maptiler/sdk` | `@maptiler/sdk` | 4.2.0 | BSD-3-Clause | Only if you upgrade to MapTiler |
| `mapbox-gl` | `mapbox-gl` | 3.33.0 | proprietary | ❌ not recommended |

**Minimal working React setup:**

```jsx
import { useEffect, useRef } from 'react'
import Map, { Layer, Source, Marker } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Free, key-free style (MapLibre style spec v8)
const OFM_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
// Light style, good for a transit overlay: 'https://tiles.openfreemap.org/styles/positron'

export default function TransitMap({ routes, stops, onStopClick }) {
  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ longitude: 106.8, latitude: -6.25, zoom: 11 }}
      mapStyle={OFM_STYLE}
      attributionControl={{ compact: true }}
    >
      <Source id="tj-routes" type="geojson" data={routes}>
        <Layer
          id="tj-routes-line"
          type="line"
          paint={{ 'line-color': '#0b6cf0', 'line-width': 3.5 }}
        />
      </Source>
      <Source id="tj-stops" type="geojson" data={stops}>
        <Layer
          id="tj-stops-circle"
          type="circle"
          paint={{
            'circle-radius': 5,
            'circle-color': ['match', ['get', 'severity'], 'suspended', '#d92d20', 'partial', '#f79009', '#12b76a'],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
          }}
        />
      </Source>
      {stops.features.map((f) => (
        <Marker
          key={f.properties.id}
          longitude={f.geometry.coordinates[0]}
          latitude={f.geometry.coordinates[1]}
          onClick={(e) => { e.originalEvent.stopPropagation(); onStopClick(f.properties) }}
        />
      ))}
    </Map>
  )
}
```

**Offline / PWA:** OpenFreeMap allows up to **3,000 tiles or 50 MB per download**, ≤4 parallel requests, with a unique `User-Agent`. Use MapLibre's offline/`cache` APIs (or `@maplibre/maplibre-offline` — **UNVERIFIED version**) to pre-cache the Greater Jakarta bbox (roughly lon 106.65–107.05, lat -6.35 to -6.05) at z12–z14.

**Operational cautions:**
- OpenFreeMap's public instance is **donation-funded with no SLA**. For production, plan to self-host (weekly planet dumps in Btrfs/MBTiles) or keep a MapTiler/Stadia fallback style behind a runtime flag.
- **Attribution is mandatory** (MapLibre's attribution control handles it automatically — don't remove it).
- Send a real `User-Agent` from any server-side tile fetches.

---

## 7. Recommended integrated stack

```
┌───────────────────────────────────────────────────────────────┐
│  DISRUPTION INGESTION                                         │
│                                                               │
│  X API v2 (pay-per-use credits, app-only Bearer)             │
│    └─ poll /2/tweets/search/recent every 5 min, per handle    │
│       handles: PT_Transjakarta, mrtjakarta, lrtjkt,          │
│                lrtjabodebek, KAI121                           │
│    └─ cost ≈ $6–12/mo (posts read, 24h dedup)                 │
│                                                               │
│  Tavily (1,000 free credits/mo)                               │
│    └─ /search topic=news, time_range=day, include_domains     │
│       → Indonesian transit disruption articles                │
│    └─ /extract to pull full article text                      │
│    └─ /crawl + /map for operator newsrooms (no public feed)    │
└───────────────────────────────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────────────────┐
│  NORMALIZATION + EXTRACTION                                   │
│  OpenRouter (/chat/completions)                                │
│    cheap+fast default: google/gemini-2.5-flash-lite           │
│      ($0.10/$0.40 per M, tools + structured outputs ✅)        │
│    strong reasoning: anthropic/claude-sonnet-5.5 or           │
│                      openai/gpt-6.1-sol / deepseek/deepseek-v4-pro│
│    tool calling: classify_disruption, geocode_place            │
│    structured outputs: strict json_schema (mode/severity/routes)│
│  OpenRouter /embeddings (openai/text-embedding-3-small)       │
│    → semantic place-resolution fallback re-ranker             │
└───────────────────────────────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────────────────┐
│  GEOMETRY + MAP                                               │
│  MapLibre GL JS (maplibre-gl 6.15.0) + react-map-gl (8.1.3)   │
│    style: https://tiles.openfreemap.org/styles/positron       │
│           https://tiles.openfreemap.org/styles/liberty        │
│    tiles: https://tiles.openfreemap.org/planet  (NO KEY)      │
│  Geometry source: OSM via Overpass (z.overpass-api.de)        │
│                   + Nominatim geocoding (NO KEY)              │
│  Static reference: satudata.jakarta.go.id CSV exports (NO KEY)│
└───────────────────────────────────────────────────────────────┘
```

**Concrete model routing for the agent:**

| Task | Model | Why |
|---|---|---|
| Classify + structure an incoming X/Tavily item | `google/gemini-2.5-flash-lite` | $0.10/$0.40, tools ✅, structured outputs ✅, 1M ctx, very fast |
| Route/disruption impact reasoning | `deepseek/deepseek-v4-pro` | $0.446/$0.892, 1M ctx, reasoning ✅ — unusually cheap for a reasoning model |
| Complex multi-step planning / ambiguous alert reconciliation | `anthropic/claude-sonnet-5.5` | $2/$10, 1M ctx, best-in-class structured outputs |
| Cheap high-volume classification (fallback) | `qwen/qwen3.7-flash` | $0.030/$0.13 — the cheapest tool-calling model in the live list |
| Dev / no-budget | `openrouter/free` or `minimax/minimax-m3.1-flash:free` | Free, but subject to the free-model daily cap |

**Monthly cost sketch (a single dev-scale deployment):**
- X API: ~$6–12 (posts read)
- Tavily: $0 (1,000 free credits/mo covers ~500–1,000 basic news searches)
- OpenRouter: ~$2–10 depending on volume (flash-lite dominated)
- Maps: **$0** (OpenFreeMap public instance)
- **Total: roughly $10–25/month**

---

## 8. Endpoints I could NOT verify (honest gap list)

| # | Item | Status | What I observed |
|---|---|---|---|
| 1 | `https://api.transjakarta.co.id/v3/*` | ❌ **Dead** | DNS resolves (103.145.125.20) but TCP connection **refused** on 80 & 443 |
| 2 | `https://data.kai.id/`, `https://gtfs.kai.id/` | ❌ **Do not exist** | **NXDOMAIN** |
| 3 | `https://data.kai.co.id/` | ❌ Parked | "domain may be for sale" |
| 4 | `https://api.mrtjakarta.co.id/`, `https://gtfs.mrtjakarta.co.id/` | ❌ Do not exist | **DNS SERVFAIL** |
| 5 | `https://jakarta.lrtjabodebek.co.id/` | ❌ Does not exist | **NXDOMAIN** |
| 6 | `https://api.lrtjakarta.co.id/` | ❌ Broken TLS | **HTTP 526** — Cloudflare "invalid SSL certificate on origin" |
| 7 | `https://api.kai.id/<route>` | ⚠️ **Route UNVERIFIED** | Host is live and returns JSON (`{"message":"no route and no API found with those values"}`), but no valid path found. Use DevTools on `kai.id` to discover the real paths. |
| 8 | Public GTFS feed for TransJakarta / KAI / MRT / LRT | ⚠️ **None found** | `data.go.id` search for "gtfs" → 0 results; `gtfs.transjakarta.co.id` is a NIK-gated upload portal |
| 9 | `gtfs.transjakarta.co.id` as a *public* feed | ❌ Not public | NIK-gated login |
| 10 | X search parser accepting a 5-way `(from:a OR from:b OR …)` group | ⚠️ **UNVERIFIED** | Docs list `from:` and Boolean OR, but I could not test without a key. Fallback = one request per handle. |
| 11 | X recent-search `query` max length | ⚠️ **Docs conflict** | Prose + rate-limit table say **512**; the endpoint OpenAPI schema says `maxLength: 4096`. Use 512 to be safe. |
| 12 | OpenRouter free-model rate-limit numbers | ⚠️ **UNVERIFIED** | Docs render template placeholders (`{FREE_MODEL_RATE_LIMIT_RPM}` etc.). Read live from `GET /api/v1/key` → `free_model_daily_requests`. |
| 13 | OpenRouter **embedding** model ids beyond `openai/text-embedding-3-small` | ⚠️ **UNVERIFIED** | Embedding models are **absent** from `GET /api/v1/models` (checked all 470). Also: embedding **pricing** is not published. |
| 14 | OpenRouter tool-call **streaming** field-level shape | ⚠️ **UNVERIFIED** | `/docs/features/tool-calling.md` 404s. Follows the OpenAI chunk convention (`delta.tool_calls[].function.arguments` partial JSON). |
| 15 | Tavily `X-API-Key` header | ⚠️ **Legacy/UNVERIFIED** | Current official docs use `Authorization: Bearer tvly-…`. |
| 16 | Tavily `country: "indonesia"` | ⚠️ **UNVERIFIED** | The enum I read did not obviously list Indonesia; and `country` only works with `topic: "general"`. Use `include_domains` instead. |
| 17 | Tavily `days` parameter | ❌ **Removed** | Use `time_range` / `start_date` / `end_date`. |
| 18 | Mapbox Maps free-tier map-load allowance | ⚠️ **UNVERIFIED** | The Maps tab of mapbox.com/pricing is JS-rendered; only the Navigation section is server-side HTML. |
| 19 | MapTiler per-plan tile quotas | ⚠️ **UNVERIFIED** | Same reason — counters are JS-rendered. |
| 20 | `@stadiamaps/*` npm packages | ❌ **Do not exist** | 6 name variants checked, all 404 on the npm registry. |
| 21 | Official KAI Commuter handle | ⚠️ **None found** | `@KAICommuter` is a **parody**. `@KAI121` is the official KAI account. |
| 22 | `@mrtjakarta` / `@lrtjabodebek` as *site-linked* handles | ⚠️ **Partially verified** | Both accounts exist, are correct by bio, and `@mrtjakarta` carries a blue check; but both operator sites were unreachable from this environment, so I could not read the official footer link. |
| 23 | A separate verified KAI Commuter X account | ⚠️ **UNVERIFIED** | Possibly under a name I did not try. |

**Recommended next verification steps (all cheap):**
1. Open `https://www.kai.id/` in a browser → DevTools → Network → XHR → read the real `api.kai.id` paths (also try `https://www.kai.id/gtfs` and the `/Informasi/` section).
2. Open `https://mrtjakarta.co.id/` and `https://www.lrtjabodebek.co.id/` from an Indonesian IP to confirm the footer X links.
3. Sign up for one free OpenRouter key and run the §3.7 curl examples end-to-end (also the `/embeddings` call) — that validates model ids, tool-call streaming, and embedding pricing in one pass.
4. Buy $10 of X API credits and run the §1.9 recent-search curl twice — that settles the multi-handle OR question and the 512-vs-4096 query-length question.
