import { describe, expect, it } from "vitest";

import { LocalHashEncoder, OpenAiCompatibleEncoder } from "./encoder.js";

/**
 * The embedding providers.
 *
 * The local encoder is the one that runs without a key, so it is the one
 * that has to be trustworthy: two names that mean the same place have to
 * land close together, and two names that do not have to stay apart.
 */

describe("LocalHashEncoder", () => {
  const encoder = new LocalHashEncoder(768);

  const cosine = (a: number[], b: number[]): number => {
    let dot = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let index = 0; index < a.length; index += 1) {
      const left = a[index] ?? 0;
      const right = b[index] ?? 0;
      dot += left * right;
      magnitudeA += left * left;
      magnitudeB += right * right;
    }
    return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB) || 1);
  };

  it("produces normalised vectors of the requested width", async () => {
    const [vector] = await encoder.embed(["Bundaran HI"]);
    expect(vector).toHaveLength(768);
    const magnitude = Math.sqrt((vector ?? []).reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("places related names closer than unrelated ones", async () => {
    const [a, b, c] = await encoder.embed([
      "Bundaran HI",
      "Bundaran HI Bank Jakarta",
      "Kelapa Gading",
    ]);
    const related = cosine(a ?? [], b ?? []);
    const unrelated = cosine(a ?? [], c ?? []);
    expect(related).toBeGreaterThan(unrelated);
  });

  it("is deterministic", async () => {
    const [first] = await encoder.embed(["Cawang Sentral"]);
    const [second] = await encoder.embed(["Cawang Sentral"]);
    expect(first).toEqual(second);
  });

  it("returns a zero vector for empty text", async () => {
    const [vector] = await encoder.embed(["   "]);
    expect(vector?.every((value) => value === 0)).toBe(true);
  });
});

describe("OpenAiCompatibleEncoder", () => {
  it("refuses a response whose width does not match the column", async () => {
    const encoder = new OpenAiCompatibleEncoder({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      model: "test-model",
      dimensions: 4,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      await expect(encoder.embed(["x"])).rejects.toThrow(/dimensions/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports a failed request with its status", async () => {
    const encoder = new OpenAiCompatibleEncoder({
      baseUrl: "https://example.invalid",
      apiKey: "test",
      model: "test-model",
      dimensions: 4,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", { status: 503 })) as typeof fetch;

    try {
      await expect(encoder.embed(["x"])).rejects.toThrow(/503/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
