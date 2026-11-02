/**
 * The X (Twitter) API client.
 *
 * The runtime worker uses the filtered stream (`stream.ts`) and does not call
 * this client. Recent search remains for the manual notice-verification and
 * corpus-fetch CLIs; it is not a chat tool and it is not a poll.
 *
 * Recent search is limited to the last seven days and to 450 requests per
 * 15 minutes. It paginates, so a caller that reads only the first page loses
 * every post after it; this client returns the page token explicitly.
 */

export type XPost = {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  /** The handle the post came from, without the leading "@". */
  authorHandle: string;
  url: string;
  lang?: string;
  /** The root post of a reply thread, when X reports one. */
  conversationId?: string;
  /** Posts this one quotes or replies to. */
  referencedPostIds?: string[];
  /** The Post this one answers, when it is a reply. */
  inReplyToPostId?: string;
  /** The author this one answers, when it is a reply. */
  inReplyToUserId?: string;
  /** X calls every item a Post; this says whether it is an original or a reply. */
  postType?: "post" | "reply";
  /** Photos and video previews attached to the Post. */
  media?: XMedia[];
};

/** One image attached to a Post, ready for the classifier. */
export type XMedia = {
  url: string;
  type: string;
  /** The author's alt text, when X has one. */
  altText?: string;
};

/** The official accounts of the operators this platform covers. */
export const OPERATOR_HANDLES = {
  transjakarta: "PT_Transjakarta",
  "mrt-jakarta": "mrtjakarta",
  "lrt-jakarta": "lrtjkt",
  "lrt-jabodebek": "lrtjabodebek",
  "krl-jabodetabek": "CommuterLine",
} as const;

export type OperatorHandle = keyof typeof OPERATOR_HANDLES;

export type XFetchMode = "timeline" | "search";

export class XApiError extends Error {
  /** When X says the rate limit resets, when the response says so. */
  readonly resetAt: Date | null;
  readonly status: number;

  constructor(
    message: string,
    options?: { cause?: unknown; resetAt?: Date | null; status?: number },
  ) {
    super(message, options);
    this.name = "XApiError";
    this.resetAt = options?.resetAt ?? null;
    this.status = options?.status ?? 0;
  }
}

export type XSearchRequest = {
  /** Return posts newer than this id. Mutually exclusive with `startTime`. */
  sinceId?: string;
  /** Used on the first scan of an account, to bound the backfill. */
  startTime?: Date;
  /** Only posts before this instant. */
  endTime?: Date;
  /** Continue a scan from the previous page. */
  pageToken?: string;
  /** How many pages this call may read. Default 4 (up to 400 posts). */
  maxPages?: number;
  /** The stable X user id. Without it, the client uses recent search. */
  accountId?: string;
};

export type XSearchPage = {
  posts: XPost[];
  newestId: string | null;
  oldestId: string | null;
  /** Pass this back to continue; null means the scan reached the end. */
  nextToken: string | null;
  pages: number;
  /** True when `nextToken` is null. */
  complete: boolean;
  rateLimitResetAt: Date | null;
  mode: XFetchMode;
};

export type XPostSearchRequest = {
  /** How many pages of up to 100 posts to read. */
  maxPages?: number;
  /**
   * Ask for author profiles. Default true for the manual CLIs. The worker's
   * catch-up sets this false because the query already names the handle.
   */
  includeAuthors?: boolean;
  /** The known handle, used when author profiles are not requested. */
  authorHandle?: string;
  /** Only posts after this instant. */
  startTime?: Date;
  /** Only posts before this instant. */
  endTime?: Date;
  /** Only posts newer than this id. */
  sinceId?: string;
  /** Posts per page, 10-100. */
  maxResults?: number;
};

export type XClient = {
  /**
   * The newest posts and replies of one account, optionally newer than
   * `sinceId`, with every page up to `maxPages`.
   *
   * Retweets are left out. A reply written by the operator is kept.
   */
  searchAccount(handle: string, request?: XSearchRequest): Promise<XSearchPage>;
  /**
   * Search the recent public conversation for a topic, route or event.
   *
   * This is the endpoint the verifier uses to read replies and corrections
   * that are not on the operator's own timeline.
   */
  searchPosts(query: string, request?: XPostSearchRequest): Promise<XSearchPage>;
  /** Resolve the stable user id once. Null when the account does not exist. */
  getAccountId(handle: string): Promise<string | null>;
};

import type { UsageSink } from "./usage.js";

export type XClientOptions = {
  bearerToken: string;
  baseUrl: string;
  /** Per-request timeout. The page loop has its own budget. */
  timeoutMs?: number;
  /** Where the X calls are recorded; absent in tests and one-off scripts. */
  usage?: { operation: string; sink: UsageSink };
};

const PAGE_SIZE = 100;
/** X bills a read Post at $0.005 on the pay-per-use plan. */
export const X_COST_PER_POST_USD = 0.005;
const DEFAULT_MAX_PAGES = 4;
/**
 * Recent search calls the long-form field `note_post`; the filtered stream
 * still exposes it as `note_tweet`. Sending the wrong name drops the full
 * text of a long announcement, so the two requests keep separate field
 * lists instead of sharing one.
 */
const SEARCH_TWEET_FIELDS =
  "created_at,author_id,lang,entities,conversation_id,referenced_tweets,in_reply_to_user_id,note_post,attachments";
const TIMELINE_TWEET_FIELDS =
  "created_at,author_id,lang,entities,conversation_id,referenced_tweets,in_reply_to_user_id,note_tweet,attachments";
const MEDIA_FIELDS = "url,preview_image_url,alt_text,type";

/** The post fields the API returns, in the shape both endpoints use. */
export type XTweetPayload = {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  author_id?: string;
  conversation_id?: string;
  referenced_tweets?: { type: string; id: string }[];
  in_reply_to_user_id?: string;
  note_tweet?: { text?: string };
  note_post?: { text?: string };
  attachments?: { media_keys?: string[] };
};

export type XMediaPayload = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
};

/** One API post, mapped to the record the monitor stores. */
export function xPostOf(
  tweet: XTweetPayload,
  users: ReadonlyMap<string, { id: string; username: string; name: string }>,
  media: ReadonlyMap<string, XMediaPayload> = new Map(),
): XPost {
  const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
  const handle = author?.username ?? "";
  const repliedTo = tweet.referenced_tweets?.find((reference) => reference.type === "replied_to");
  const images = (tweet.attachments?.media_keys ?? []).flatMap((key) => {
    const item = media.get(key);
    if (!item) return [];
    const url = item.url ?? item.preview_image_url;
    if (!url) return [];
    return [{ url, type: item.type, ...(item.alt_text ? { altText: item.alt_text } : {}) }];
  });
  return {
    id: tweet.id,
    text: tweet.note_post?.text ?? tweet.note_tweet?.text ?? tweet.text,
    createdAt: tweet.created_at ?? new Date().toISOString(),
    authorId: tweet.author_id ?? "",
    authorHandle: handle,
    url: handle ? buildPostUrl(handle, tweet.id) : `https://x.com/i/status/${tweet.id}`,
    ...(tweet.lang ? { lang: tweet.lang } : {}),
    ...(tweet.conversation_id ? { conversationId: tweet.conversation_id } : {}),
    ...(tweet.referenced_tweets
      ? { referencedPostIds: tweet.referenced_tweets.map((reference) => reference.id) }
      : {}),
    ...(repliedTo ? { inReplyToPostId: repliedTo.id } : {}),
    ...(tweet.in_reply_to_user_id
      ? { inReplyToUserId: tweet.in_reply_to_user_id }
      : {}),
    postType: tweet.in_reply_to_user_id || repliedTo ? "reply" : "post",
    ...(images.length > 0 ? { media: images } : {}),
  };
}

export function createXClient(options: XClientOptions): XClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const report = (event: {
    operation: string;
    endpoint?: string;
    status?: string;
    requests?: number;
    posts?: number;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): void => {
    options.usage?.sink({
      kind: "x",
      provider: "x",
      operation: event.operation,
      endpoint: event.endpoint ?? null,
      status: event.status ?? null,
      requests: event.requests ?? 1,
      posts: event.posts ?? 0,
      costUsd: (event.posts ?? 0) * X_COST_PER_POST_USD,
      latencyMs: event.latencyMs,
      metadata: event.metadata,
    });
  };

  return {
    async searchPosts(
      query: string,
      request: XPostSearchRequest = {},
    ): Promise<XSearchPage> {
      const started = Date.now();
      const posts: XPost[] = [];
      let pageToken: string | null = null;
      let newestId: string | null = null;
      let oldestId: string | null = null;
      let pages = 0;
      let rateLimitResetAt: Date | null = null;
      const maxPages = Math.max(1, request.maxPages ?? 1);

      for (;;) {
        const includeAuthors = request.includeAuthors !== false;
        const params = new URLSearchParams({
          query: query.slice(0, 500),
          max_results: String(Math.min(100, Math.max(10, request.maxResults ?? PAGE_SIZE))),
          "tweet.fields": SEARCH_TWEET_FIELDS,
          expansions: includeAuthors
            ? "author_id,attachments.media_keys"
            : "attachments.media_keys",
          "media.fields": MEDIA_FIELDS,
        });
        if (includeAuthors) params.set("user.fields", "username,name");
        if (request.sinceId) params.set("since_id", request.sinceId);
        else if (request.startTime) params.set("start_time", request.startTime.toISOString());
        if (request.endTime) params.set("end_time", request.endTime.toISOString());
        if (pageToken) params.set("next_token", pageToken);

        const response = await fetch(`${base}/2/tweets/search/recent?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${options.bearerToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
        const resetAt = parseReset(response.headers.get("x-rate-limit-reset"));
        if (resetAt) rateLimitResetAt = resetAt;
        if (response.status === 429) {
          throw new XApiError("X search rate limit reached", { resetAt, status: 429 });
        }
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new XApiError(
            `X search failed with ${response.status}: ${body.slice(0, 300)}`,
            { resetAt, status: response.status },
          );
        }
        const payload = (await response.json()) as {
          data?: XTweetPayload[];
          includes?: {
            users?: { id: string; username: string; name: string }[];
            media?: XMediaPayload[];
          };
          meta?: {
            newest_id?: string;
            oldest_id?: string;
            result_count?: number;
            next_token?: string;
          };
        };
        const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
        const media = new Map(
          (payload.includes?.media ?? []).map((item) => [item.media_key, item]),
        );
        for (const tweet of payload.data ?? []) {
          const post = xPostOf(tweet, users, media);
          if (request.authorHandle) {
            post.authorHandle = request.authorHandle;
            post.url = buildPostUrl(request.authorHandle, post.id);
          }
          posts.push(post);
        }
        const meta = payload.meta;
        newestId = newestId ?? meta?.newest_id ?? payload.data?.[0]?.id ?? null;
        oldestId = meta?.oldest_id ?? payload.data?.at(-1)?.id ?? oldestId;
        pages += 1;
        const next = meta?.next_token ?? null;
        if (!next || pages >= maxPages) {
          report({
            operation: options.usage?.operation ?? "x_search",
            endpoint: "/2/tweets/search/recent",
            status: "ok",
            requests: pages,
            posts: posts.length,
            latencyMs: Date.now() - started,
            metadata: postTypeMetadata(posts),
          });
          return {
            posts,
            newestId,
            oldestId,
            nextToken: next,
            pages,
            complete: !next,
            rateLimitResetAt,
            mode: "search",
          };
        }
        pageToken = next;
      }
    },

    async getAccountId(handle: string): Promise<string | null> {
      const response = await fetch(
        `${base}/2/users/by/username/${encodeURIComponent(handle)}?user.fields=id`,
        {
          headers: {
            Authorization: `Bearer ${options.bearerToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        },
      );
      if (response.status === 404) return null;
      const resetAt = parseReset(response.headers.get("x-rate-limit-reset"));
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new XApiError(
          `X user lookup failed for @${handle} with ${response.status}: ${body.slice(0, 300)}`,
          { resetAt, status: response.status },
        );
      }
      const payload = (await response.json()) as { data?: { id?: string } };
      return payload.data?.id ?? null;
    },

    async searchAccount(handle: string, request: XSearchRequest = {}): Promise<XSearchPage> {
      const started = Date.now();
      const mode: XFetchMode = request.accountId ? "timeline" : "search";
      const endpoint =
        mode === "timeline"
          ? `${base}/2/users/${encodeURIComponent(request.accountId ?? "")}/tweets`
          : `${base}/2/tweets/search/recent`;

      const posts: XPost[] = [];
      let pageToken = request.pageToken ?? null;
      let newestId: string | null = null;
      let oldestId: string | null = null;
      let pages = 0;
      let rateLimitResetAt: Date | null = null;
      const maxPages = Math.max(1, request.maxPages ?? DEFAULT_MAX_PAGES);

      for (;;) {
        const params = new URLSearchParams({
          max_results: String(PAGE_SIZE),
          "tweet.fields": mode === "search" ? SEARCH_TWEET_FIELDS : TIMELINE_TWEET_FIELDS,
          expansions: "author_id,attachments.media_keys",
          "user.fields": "username,name",
          "media.fields": MEDIA_FIELDS,
        });
        if (mode === "search") {
          params.set("query", `from:${handle} -is:retweet`);
        } else {
          params.set("exclude", "retweets");
        }
        if (request.sinceId) params.set("since_id", request.sinceId);
        else if (request.startTime) params.set("start_time", request.startTime.toISOString());
        if (request.endTime) params.set("end_time", request.endTime.toISOString());
        if (pageToken) {
          params.set(mode === "timeline" ? "pagination_token" : "next_token", pageToken);
        }

        const response = await fetch(`${endpoint}?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${options.bearerToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });

        const resetAt = parseReset(response.headers.get("x-rate-limit-reset"));
        if (resetAt) rateLimitResetAt = resetAt;

        if (response.status === 429) {
          const reset = response.headers.get("x-rate-limit-reset");
          throw new XApiError(
            `X API rate limit reached for @${handle}${reset ? ` (reset at ${reset})` : ""}`,
            { resetAt, status: 429 },
          );
        }
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new XApiError(
            `X API request failed for @${handle} with ${response.status}: ${body.slice(0, 300)}`,
            { resetAt, status: response.status },
          );
        }

        const payload = (await response.json()) as {
          data?: XTweetPayload[];
          includes?: {
            users?: { id: string; username: string; name: string }[];
            media?: XMediaPayload[];
          };
          meta?: {
            newest_id?: string;
            oldest_id?: string;
            result_count?: number;
            next_token?: string;
          };
        };

        const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
        const media = new Map(
          (payload.includes?.media ?? []).map((item) => [item.media_key, item]),
        );
        for (const tweet of payload.data ?? []) {
          const post = xPostOf(tweet, users, media);
          if (!post.authorHandle) {
            post.authorHandle = handle;
            post.url = buildPostUrl(handle, post.id);
          }
          posts.push(post);
        }

        const meta = payload.meta;
        newestId = newestId ?? meta?.newest_id ?? payload.data?.[0]?.id ?? null;
        oldestId = meta?.oldest_id ?? payload.data?.at(-1)?.id ?? oldestId;
        pages += 1;

        const next = meta?.next_token ?? null;
        if (!next) {
          report({
            operation: options.usage?.operation ?? "x_account",
            endpoint: mode === "search" ? "/2/tweets/search/recent" : "/2/users/:id/tweets",
            status: "ok",
            requests: pages,
            posts: posts.length,
            latencyMs: Date.now() - started,
            metadata: postTypeMetadata(posts),
          });
          return {
            posts,
            newestId,
            oldestId,
            nextToken: null,
            pages,
            complete: true,
            rateLimitResetAt,
            mode,
          };
        }
        if (pages >= maxPages) {
          report({
            operation: options.usage?.operation ?? "x_account",
            endpoint: mode === "search" ? "/2/tweets/search/recent" : "/2/users/:id/tweets",
            status: "ok",
            requests: pages,
            posts: posts.length,
            latencyMs: Date.now() - started,
            metadata: postTypeMetadata(posts),
          });
          return {
            posts,
            newestId,
            oldestId,
            nextToken: next,
            pages,
            complete: false,
            rateLimitResetAt,
            mode,
          };
        }
        pageToken = next;
      }
    },
  };
}

function postTypeMetadata(posts: readonly XPost[]): Record<string, number> {
  const replies = posts.filter((post) => post.postType === "reply").length;
  return { posts: posts.length - replies, replies };
}

function buildPostUrl(username: string, tweetId: string): string {
  return `https://x.com/${username}/status/${tweetId}`;
}

function parseReset(value: string | null): Date | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1_000);
}
