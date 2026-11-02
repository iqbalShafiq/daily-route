import {
  XApiError,
  X_COST_PER_POST_USD,
  xPostOf,
  type XMediaPayload,
  type XPost,
  type XTweetPayload,
  type XClientOptions,
} from "./x.js";

/**
 * The X filtered stream.
 *
 * There is one connection per App, and it delivers every Post that matches
 * the rules. The monitor uses it instead of polling the operator timelines:
 * a Post arrives within seconds, and a reply the operator writes arrives the
 * same way.
 *
 * This client owns the connection, not the policy. Reconnecting is the
 * worker's job; it opens the same stream again. Nothing here fetches
 * history: if a Post was missed while the connection was down, it stays
 * missed, and the worker records the gap.
 */

export type StreamRule = {
  value: string;
  tag?: string;
};

export type StreamPostMeta = {
  /** The rule tag that matched, i.e. the operator's system id. */
  systemId: string | null;
};

export type StreamHandlers = {
  onPost: (post: XPost, meta: StreamPostMeta) => void | Promise<void>;
  /** Called when the connection is open and rules are in place. */
  onReady?: () => void;
  onError?: (error: unknown) => void;
};

export type XStream = {
  /** Connect and deliver Posts until the signal aborts or the stream ends. */
  open(handlers: StreamHandlers, signal: AbortSignal): Promise<void>;
  /** Stop the current connection. */
  close(): void;
};

export type XStreamOptions = XClientOptions & {
  rules: readonly StreamRule[];
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

const STREAM_FIELDS =
  "created_at,author_id,lang,conversation_id,referenced_tweets,in_reply_to_user_id,note_tweet,attachments";
const STREAM_MEDIA_FIELDS = "url,preview_image_url,alt_text,type";

/**
 * One rule per operator account.
 *
 * `from:` delivers the account's original Posts and its replies. Retweets
 * are noise: they repeat a Post the account did not write.
 */
export function buildStreamRules(
  handles: readonly { systemId: string; handle: string }[],
): StreamRule[] {
  return handles.map(({ systemId, handle }) => ({
    value: `from:${handle} -is:retweet`,
    tag: systemId,
  }));
}

export function createXStream(options: XStreamOptions): XStream {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  /** The rules survive a reconnect; installing them twice burns the quota. */
  let rulesReady = false;
  /*
   * The stream rule already names the account, so the author handle is
   * derived from its tag. Asking X for `expansions=author_id` would add a
   * billable User Read for every Post.
   */
  const handleByTag = new Map<string, string>();
  for (const rule of options.rules) {
    if (!rule.tag) continue;
    const match = /^from:([^\s]+)/.exec(rule.value);
    if (match?.[1]) handleByTag.set(rule.tag, match[1].replace(/^@/, ""));
  }

  const headers = {
    Authorization: `Bearer ${options.bearerToken}`,
    Accept: "application/json",
  };
  const report = (event: {
    operation: string;
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
      endpoint: "/2/tweets/search/stream",
      status: event.status ?? null,
      requests: event.requests ?? 1,
      posts: event.posts ?? 0,
      costUsd: (event.posts ?? 0) * X_COST_PER_POST_USD,
      latencyMs: event.latencyMs,
      metadata: event.metadata,
    });
  };
  const streamStarted = Date.now();

  /** Replace the App's rules with the ones this monitor owns. */
  async function reconcile(): Promise<void> {
    const current = await doFetch(`${base}/2/tweets/search/stream/rules`, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!current.ok) {
      throw new XApiError(`Reading stream rules failed with ${current.status}`, {
        status: current.status,
      });
    }
    const payload = (await current.json()) as {
      data?: { id: string; value?: string; tag?: string }[];
    };
    const currentRules = payload.data ?? [];
    // A reconnect must not delete and re-add the same rules. X rate-limits
    // rule writes; churn on every reconnect can leave the worker in a 429
    // loop and strand the stream.
    const wanted = options.rules;
    const sameRules =
      currentRules.length === wanted.length &&
      currentRules.every((rule) =>
        wanted.some(
          (candidate) =>
            candidate.value === rule.value &&
            (candidate.tag ?? "") === (rule.tag ?? ""),
        ),
      );
    if (sameRules) return;

    const ids = currentRules.map((rule) => rule.id);
    if (ids.length > 0) {
      const response = await doFetch(`${base}/2/tweets/search/stream/rules`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ delete: { ids } }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (!response.ok) {
        throw new XApiError(`Deleting stream rules failed with ${response.status}`, {
          status: response.status,
        });
      }
    }
    const added = await doFetch(`${base}/2/tweets/search/stream/rules`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ add: options.rules }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!added.ok) {
      const body = await added.text().catch(() => "");
      throw new XApiError(
        `Adding stream rules failed with ${added.status}: ${body.slice(0, 300)}`,
        { status: added.status },
      );
    }
  }

  return {
    async open(handlers, signal): Promise<void> {
      const stop = (): void => controller.abort();
      if (signal.aborted) return;
      signal.addEventListener("abort", stop, { once: true });

      try {
        if (!rulesReady) {
          await reconcile();
          rulesReady = true;
        }
        const params = new URLSearchParams({
          "tweet.fields": STREAM_FIELDS,
          expansions: "attachments.media_keys",
          "media.fields": STREAM_MEDIA_FIELDS,
        });
        const response = await doFetch(
          `${base}/2/tweets/search/stream?${params.toString()}`,
          { headers, signal: controller.signal },
        );
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new XApiError(
            `The stream failed with ${response.status}: ${body.slice(0, 300)}`,
            { status: response.status },
          );
        }
        if (!response.body) throw new Error("The stream returned no body.");
        report({
          operation: options.usage?.operation ?? "monitor",
          status: "ok",
          requests: 1,
          latencyMs: Date.now() - streamStarted,
        });
        handlers.onReady?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const deliver = async (line: string): Promise<void> => {
          const trimmed = line.trim();
          if (trimmed.length === 0) return;
          let payload: {
            data?: XTweetPayload;
            includes?: {
              users?: { id: string; username: string; name: string }[];
              media?: XMediaPayload[];
            };
            matching_rules?: { tag?: string }[];
          };
          try {
            payload = JSON.parse(trimmed) as typeof payload;
          } catch {
            return;
          }
          if (!payload.data) return;
          const systemId =
            payload.matching_rules?.find((rule) => rule.tag)?.tag ?? null;
          const handle = systemId ? handleByTag.get(systemId) : undefined;
          const users = new Map<string, { id: string; username: string; name: string }>();
          if (payload.data.author_id && handle) {
            users.set(payload.data.author_id, {
              id: payload.data.author_id,
              username: handle,
              name: handle,
            });
          }
          const media = new Map(
            (payload.includes?.media ?? []).map((item) => [item.media_key, item]),
          );
          const post = xPostOf(payload.data, users, media);
          await handlers.onPost(post, { systemId });
          report({
            operation: options.usage?.operation ?? "monitor",
            status: "ok",
            posts: 1,
            metadata: {
              systemId,
              postType: post.postType ?? "post",
              ...(post.inReplyToPostId ? { inReplyToPostId: post.inReplyToPostId } : {}),
            },
          });
        };

        let pending = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? "";
          for (const line of lines) await deliver(line);
        }
        // A stream can end without a trailing newline; the last Post still
        // counts.
        await deliver(pending);
      } catch (error) {
        if (!controller.signal.aborted) {
          report({
            operation: options.usage?.operation ?? "monitor",
            status: "error",
            metadata: {
              error: error instanceof Error ? error.message.slice(0, 300) : String(error),
            },
          });
          handlers.onError?.(error);
        }
      } finally {
        signal.removeEventListener("abort", stop);
      }
    },

    close(): void {
      controller.abort();
    },
  };
}

/**
 * A stream that replays recorded Posts.
 *
 * The backtest does not need X: the same interface is fed with the Posts the
 * monitor already stored, in the order they were published. A delay may be
 * set per Post so a test can observe the queue draining while the stream is
 * still running.
 */
export function createStubStream(
  posts: readonly { post: XPost; delayMs?: number; systemId?: string }[],
): XStream & { delivered: number } {
  let delivered = 0;
  const stream = {
    delivered: 0,
    async open(handlers: StreamHandlers, signal: AbortSignal): Promise<void> {
      handlers.onReady?.();
      for (const entry of posts) {
        if (signal.aborted) return;
        if (entry.delayMs && entry.delayMs > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, entry.delayMs);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }
        if (signal.aborted) return;
        await handlers.onPost(entry.post, { systemId: entry.systemId ?? null });
        delivered += 1;
        stream.delivered = delivered;
      }
    },
    close(): void {
      // The signal owns the lifetime; nothing else to release.
    },
  };
  return stream;
}

export type SupervisorOptions = {
  signal: AbortSignal;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Called after a connection ends and before the next attempt. */
  onReconnect?: (attempt: number) => void;
  /** Injected in tests so a backoff does not wait. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Keep the one connection open.
 *
 * A dropped stream is opened again with exponential backoff. There is no
 * second source: the gap is not filled later, it is only counted.
 */
export async function superviseStream(
  stream: XStream,
  handlers: StreamHandlers,
  options: SupervisorOptions,
): Promise<void> {
  const initial = options.initialBackoffMs ?? 1_000;
  const maximum = options.maxBackoffMs ?? 60_000;
  const sleep = options.sleep ?? wait;
  let backoff = initial;
  let attempt = 0;
  while (!options.signal.aborted) {
    await stream.open(handlers, options.signal);
    if (options.signal.aborted) return;
    attempt += 1;
    options.onReconnect?.(attempt);
    await sleep(backoff, options.signal);
    backoff = Math.min(backoff * 2, maximum);
  }
}
