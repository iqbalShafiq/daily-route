import { describe, expect, it, vi } from "vitest";

import { createXClient, OPERATOR_HANDLES, XApiError } from "./x.js";

/**
 * The X client.
 *
 * The request itself is the contract with the X API, so it is asserted
 * rather than assumed: the query, the authorisation and the shape of the
 * answer all matter.
 */

const RESPONSE = {
  data: [
    {
      id: "1900000000000000001",
      text: "Layanan koridor 1 dialihkan sementara.",
      created_at: "2026-10-20T09:00:00.000Z",
      author_id: "104556071",
      lang: "id",
    },
  ],
  includes: {
    users: [{ id: "104556071", username: "PT_Transjakarta", name: "Transjakarta" }],
  },
};

describe("createXClient", () => {
  it("asks for the newest posts of one account", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createXClient({
      bearerToken: "token",
      baseUrl: "https://api.x.com",
    });

    const posts = await client.searchAccount("PT_Transjakarta");

    expect(posts).toHaveLength(1);
    expect(posts[0]?.authorHandle).toBe("PT_Transjakarta");
    expect(posts[0]?.url).toContain("PT_Transjakarta/status/1900000000000000001");

    const request = fetchMock.mock.calls[0];
    const url = String(request?.[0] ?? "");
    expect(url).toContain("/2/tweets/search/recent");
    expect(url).toContain("from%3APT_Transjakarta");
    expect(url).toContain("-is%3Aretweet");

    const headers = (request?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token");

    vi.unstubAllGlobals();
  });

  it("passes the last seen post id so nothing is read twice", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    await client.searchAccount("PT_Transjakarta", "1900000000000000001");

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("since_id=1900000000000000001");

    vi.unstubAllGlobals();
  });

  it("names the rate limit when the API refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429, headers: { "x-rate-limit-reset": "60" } })),
    );

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });

    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(XApiError);
    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(/rate limit/);

    vi.unstubAllGlobals();
  });

  it("reports a failed request with its status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });

    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });
});

describe("OPERATOR_HANDLES", () => {
  it("watches the official account of every operator", () => {
    expect(OPERATOR_HANDLES).toEqual({
      transjakarta: "PT_Transjakarta",
      "mrt-jakarta": "MRTjakartaID",
      "lrt-jakarta": "lrtjkt",
      "lrt-jabodebek": "lrtjabodebek",
      "krl-jabodetabek": "KAI121",
    });
  });
});
