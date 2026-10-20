/**
 * The X (Twitter) API client.
 *
 * Only the read side is used: the worker polls the official operator
 * accounts for announcements. Each account is polled with its own request
 * rather than one combined query, because the combined `from:a OR from:b`
 * form is not documented as supported.
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
};

export type XAuthor = {
  id: string;
  username: string;
  name: string;
};

/** The official accounts of the operators this platform covers. */
export const OPERATOR_HANDLES = {
  transjakarta: "PT_Transjakarta",
  "mrt-jakarta": "MRTjakartaID",
  "lrt-jakarta": "lrtjkt",
  "lrt-jabodebek": "lrtjabodebek",
  "krl-jabodetabek": "KAI121",
} as const;

export type OperatorHandle = keyof typeof OPERATOR_HANDLES;

export class XApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "XApiError";
  }
}

export type XClient = {
  /** The newest posts of one account, optionally newer than `sinceId`. */
  searchAccount(handle: string, sinceId?: string): Promise<XPost[]>;
};

export type XClientOptions = {
  bearerToken: string;
  baseUrl: string;
  /** Fetched once per poll and reused, which keeps the request count low. */
  timeoutMs?: number;
};

export function createXClient(options: XClientOptions): XClient {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/2/tweets/search/recent`;

  return {
    async searchAccount(handle: string, sinceId?: string): Promise<XPost[]> {
      const params = new URLSearchParams({
        query: `from:${handle} -is:retweet -is:reply`,
        max_results: "100",
        "tweet.fields": "created_at,entities,lang",
      });
      if (sinceId) params.set("since_id", sinceId);

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${options.bearerToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });

      if (response.status === 429) {
        const reset = response.headers.get("x-rate-limit-reset");
        throw new XApiError(
          `X API rate limit reached for @${handle}${reset ? ` (reset at ${reset})` : ""}`,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new XApiError(
          `X API request failed for @${handle} with ${response.status}: ${body.slice(0, 300)}`,
        );
      }

      const payload = (await response.json()) as {
        data?: {
          id: string;
          text: string;
          created_at?: string;
          lang?: string;
          author_id?: string;
        }[];
        includes?: { users?: { id: string; username: string; name: string }[] };
      };

      const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));

      return (payload.data ?? []).map((tweet) => {
        const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
        return {
          id: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at ?? new Date().toISOString(),
          authorId: tweet.author_id ?? "",
          authorHandle: author?.username ?? handle,
          url: buildPostUrl(author?.username ?? handle, tweet.id),
          ...(tweet.lang ? { lang: tweet.lang } : {}),
        };
      });
    },
  };
}

function buildPostUrl(username: string, tweetId: string): string {
  return `https://x.com/${username}/status/${tweetId}`;
}
