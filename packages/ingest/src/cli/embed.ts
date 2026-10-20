import { sql } from "drizzle-orm";

import { createDb } from "@daily-route/db";
import { stationEmbeddings, stations } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";

/**
 * Compute the station embeddings.
 *
 * The embeddings are what make the place resolver semantic: a query like
 * "stasiun Grand Indonesia" finds "Bundaran HI" even though the two share
 * almost no characters.
 *
 * Run with `pnpm data:embed`. Without a remote embedding provider the
 * deterministic local encoder is used, so the step never needs a key.
 */
async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const provider = createEmbeddingProvider(env);

  console.log(`· encoder: ${provider.model} (${provider.dimensions} dimensi)`);

  const rows = await db
    .select({
      id: stations.id,
      name: stations.name,
      code: stations.code,
      aliases: stations.aliases,
      area: stations.area,
      description: stations.description,
    })
    .from(stations);

  console.log(`· ${rows.length} stasiun`);

  const documents = rows.map((row) =>
    PlaceResolver.documentFor({
      name: row.name,
      code: row.code,
      aliases: (row.aliases as string[]) ?? [],
      area: row.area,
      description: row.description,
    }),
  );

  const vectors = await provider.embed(documents);

  let written = 0;
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const slice = rows.slice(index, index + chunkSize);
    const sliceVectors = vectors.slice(index, index + chunkSize);

    await db
      .insert(stationEmbeddings)
      .values(
        slice.map((row, offset) => ({
          stationId: row.id,
          model: provider.model,
          embedding: sliceVectors[offset] ?? [],
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [stationEmbeddings.stationId, stationEmbeddings.model],
        set: { embedding: sql`excluded.embedding`, updatedAt: new Date() },
      });

    written += slice.length;
    console.log(`  ${written}/${rows.length}`);
  }

  console.log(`✓ ${written} embedding disimpan`);
  await db.$client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error("embed gagal:", error);
  process.exitCode = 1;
});
