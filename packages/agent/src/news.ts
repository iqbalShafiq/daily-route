/**
 * Tavily news search.
 *
 * The operators publish their announcements on their own websites and on X;
 * news search is what catches the announcement that never reached either.
 */

export type NewsResult = {
  title: string;
  url: string;
  content: string;
  source: string | null;
  publishedAt: string | null;
  score: number | null;
};

export type NewsSearchOptions = {
  query: string;
  maxResults?: number;
  /** Restrict the search to these domains. */
  includeDomains?: string[];
  /** "day" | "week" | "month" */
  timeRange?: "day" | "week" | "month";
};

export type NewsSearch = (options: NewsSearchOptions) => Promise<NewsResult[]>;

export class NewsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NewsError";
  }
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/**
 * Create a Tavily-backed search function.
 *
 * Returns `null` when no key is configured, so the caller can drop the tool
 * from the agent's catalog instead of exposing a tool that always fails.
 */
export function createNewsSearch(apiKey: string | undefined): NewsSearch | null {
  if (!apiKey) return null;

  return async (options: NewsSearchOptions): Promise<NewsResult[]> => {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: options.query,
        topic: "news",
        search_depth: "basic",
        max_results: Math.min(options.maxResults ?? 8, 20),
        include_answer: false,
        include_raw_content: false,
        include_published_date: true,
        ...(options.timeRange ? { time_range: options.timeRange } : {}),
        ...(options.includeDomains?.length
          ? { include_domains: options.includeDomains, include_domains_mode: "prefer" }
          : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new NewsError(`Tavily search failed with ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      results?: {
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
        score?: number;
      }[];
    };

    return (payload.results ?? []).map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      content: result.content ?? "",
      source: hostOf(result.url ?? ""),
      publishedAt: result.published_date ?? null,
      score: typeof result.score === "number" ? result.score : null,
    }));
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The domains that publish Jakarta transit announcements. */
export const TRANSIT_NEWS_DOMAINS = [
  "transjakarta.co.id",
  "mrtjakarta.co.id",
  "lrtjakarta.co.id",
  "lrtjabodebek.co.id",
  "kai.id",
  "jdi.jakarta.go.id",
  "kompas.com",
  "detik.com",
  "antaranews.com",
  "tempo.co",
  "cnnindonesia.com",
  "mediaindonesia.com",
  "jakartaglobe.id",
];
