# Notice list: lifecycle, grouping, and clearing

26 October 2026. The board is a **timeline of events**, not a feed of posts.
A notice leaves the board when the event ends or is confirmed restored — not
because the calendar page changed.

## What the references say

- GTFS Realtime service alerts: a planned disruption can be published as
  upcoming; an unknown end is left empty and filled when known; recurrent
  events use multiple time intervals.
  <https://gtfs.org/resources/mobilitydata-recommendations/gtfs-realtime-service-alerts/guidelines>
- GTFS Realtime best practices: an alert that has not been checked for about
  ten minutes is stale. <https://gtfs.org/documentation/realtime/realtime-best-practices>
- GTFS Schedule defines a service day that can pass midnight, e.g. Friday
  08:00–26:00 is Friday night into Saturday. A midnight crossing is one
  event, not two calendar rows. <https://gtfs.org/documentation/schedule/reference/>
- TfL's status page separates **Today**, the following days and "The week
  ahead", and says "Service will resume at 06:00 on Monday" rather than
  relying on "tomorrow". <https://tfl.gov.uk/tube-dlr-overground/status/>
- MTA groups every update under one event id; BART archives past alerts and
  publishes "normal service has resumed".
  <https://data.ny.gov/Transportation/MTA-Service-Alerts/7kct-peq7>
  <https://www.bart.gov/schedules/advisories>
- Citymapper filters old information out of the live disruption view.
  <https://ridewithvia.com/resources/how-citymapper-handles-unplanned-disruptions>
- NN/g: empty states must explain system status; filters need counts and a
  clear action. <https://www.nngroup.com/articles/empty-state-interface-design>
  <https://www.nngroup.com/articles/filter-categories-values>
- HPE design system: show the timezone and an absolute timestamp; relative
  text is secondary. <https://design-system.hpe.design/foundation/date-and-time>
- Google Maps transit alert ordering prioritises no-service alerts.
  <https://support.google.com/transitpartners/answer/10104517>

## Decision for Daily Route

1. **Do not clear the board at midnight.** A closure from 22:00 to 04:00 is
   one service-night event. Clearing at 00:00 would hide the still-active
   half and force the rider to rediscover it.
2. **Group by service day.** The board has a "Today" group and an
   "Overnight · carried over" group. A notice whose start is before today
   stays in the carried group while it is still in force.
3. **Show the date on carried rows.** Today's rows show `18:19 WIB`; a
   carried row shows `25 Oct, 18:19 WIB`. The board header says
   `Now 26 Oct, 11:58 WIB`.
4. **Clear on the event, not the day.** The monitor closes a notice when its
   own `ends_at` passes, a later post says service is restored, or its
   kind's lifetime expires without a fresh report. Resolved notices leave
   the live board; the archive keeps them. The incidental fallback is
   **8 hours** for a diversion, closure, service change or unknown. A newer
   Post or Reply that still reports the disruption moves `lastSeenAt`, so
   the deadline moves with it. Explicit windows, a future start and the
   longer rail/maintenance lifetimes are exempt.
5. **Freshness is visible.** The footer shows the last check. An unknown end
   is shown as active, never as a guessed reopening time.

## The lifecycle bug found while checking this

`updateNotice` used to write `lastSeenAt: new Date()` on every update. When
the worker replayed historical posts after a reconnect, an old notice looked
freshly confirmed even though no new announcement existed. Its lifetime
never expired. The update now keeps the `lastSeenAt` computed by the monitor
from the source Post, and only falls back to "now" when the caller did not
provide one. A regression test covers it.

Existing rows whose `lastSeenAt` had been refreshed by the old code were
repaired from the latest `metadata.sources[].publishedAt`. The next tick
closed 15 notices with `resolvedReason: expired`; the board fell from 24 to
23 active notices. After the fallback was changed to eight hours, the next
worker tick closed the remaining old rows and left six active notices: all
had a confirmation inside the previous eight hours.

## X: Post versus Reply

An X item is a Post. A Reply is a Post that answers another Post. The
filtered stream rule is `from:<account> -is:retweet`; `from:` matches both
original Posts and the account's Replies. A live three-minute stream test
delivered two PT Transjakarta items, both Replies, with
`in_reply_to_user_id` and `referenced_tweets[].type = replied_to`. Recent
search over the same account returned ten Replies out of ten. The client now
asks for those fields and stores `postType`, `inReplyToPostId` and
`inReplyToUserId` in `social_posts.metadata`; the usage ledger records the
type too. Prior to this change the database already contained 1,145 of 1,412
stored items with `referencedPostIds`, i.e. the account's Replies were being
ingested.

## What remains

- A separate "Past notices" view would make the archive discoverable in the
  interface; the data and the history tool already exist.
- The board still shows a notice with no end as active until a restoration
  post or the kind's lifetime. That is deliberate: the data does not support
  inventing an end.
