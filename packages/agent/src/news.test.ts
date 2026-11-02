import { afterEach, describe, expect, it, vi } from "vitest";

import { createNewsSearch } from "./news.js";

describe("createNewsSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the recent window, topic and domains to Tavily", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          results: [
            { title: "JRF", url: "https://example.test/jrf", content: "02.30-09.15", score: 0.9 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const search = createNewsSearch("key");
    expect(search).not.toBeNull();
    const results = await search?.({
      query: "Jakarta Running Festival 25 Oktober",
      timeRange: "week",
      topic: "news",
      includeDomains: ["transjakarta.co.id"],
      excludeDomains: ["spam.test"],
      searchDepth: "advanced",
    });
    expect(results).toHaveLength(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.time_range).toBe("week");
    expect(body.topic).toBe("news");
    expect(body.search_depth).toBe("advanced");
    expect(body.include_domains).toEqual(["transjakarta.co.id"]);
    expect(body.exclude_domains).toEqual(["spam.test"]);
  });
});
