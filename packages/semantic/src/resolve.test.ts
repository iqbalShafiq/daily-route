import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalHashEncoder } from "./encoder.js";
import { PlaceResolver, PLACE_CONFIDENCE_THRESHOLD } from "./resolve.js";

/**
 * The place resolver, against the real database.
 *
 * The resolver is the semantic heart of the application: it is what turns
 * "stasiun Grand Indonesia" into a station id, and what tells the
 * difference between a place that was found and a place that was guessed.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, new LocalHashEncoder(env.EMBEDDINGS_DIMENSIONS));

beforeAll(async () => {
  const { count } = await db.execute<{ count: number }>(
    "SELECT count(*)::int AS count FROM stations",
  );
  if (!count || count === 0) {
    throw new Error("The database is empty. Run `pnpm db:seed` before the tests.");
  }
});

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

class CountingEncoder extends LocalHashEncoder {
  calls = 0;

  override async embed(texts: readonly string[]): Promise<number[][]> {
    this.calls += 1;
    return super.embed(texts);
  }
}

describe("PlaceResolver", () => {
  it("reuses the query embedding for the same name", async () => {
    const provider = new CountingEncoder(env.EMBEDDINGS_DIMENSIONS);
    const cached = new PlaceResolver(db, provider);

    await cached.resolve("Kelapa Gading");
    await cached.resolve("kelapa gading");
    await cached.resolve("KELAPA GADING");

    expect(provider.calls).toBe(1);
  });

  it("finds a station by its name", async () => {
    const candidates = await resolver.resolve("Kelapa Gading");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.name.toLowerCase()).toContain("kelapa gading");
    expect(candidates[0]?.score).toBeGreaterThan(PLACE_CONFIDENCE_THRESHOLD);
  });

  it("finds an interchange by a landmark name", async () => {
    const candidates = await resolver.resolve("Grand Indonesia");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.score).toBeGreaterThan(PLACE_CONFIDENCE_THRESHOLD);
  });

  it("ignores the operator prefix in the query", async () => {
    const candidates = await resolver.resolve("Stasiun MRT Jakarta Kota");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.score).toBeGreaterThan(PLACE_CONFIDENCE_THRESHOLD);
  });

  it("scores a nonsense query below the confidence threshold", async () => {
    const candidates = await resolver.resolve("xyzzyplugh");
    const best = candidates[0]?.score ?? 0;
    expect(best).toBeLessThan(PLACE_CONFIDENCE_THRESHOLD);
  });

  it("can be restricted to one system", async () => {
    const candidates = await resolver.resolve("Cawang", {
      systemId: "krl-jabodetabek",
      limit: 5,
    });
    for (const candidate of candidates) {
      expect(candidate.systemId).toBe("krl-jabodetabek");
    }
  });

  it("returns nothing for an empty query", async () => {
    expect(await resolver.resolve("   ")).toEqual([]);
  });
});
