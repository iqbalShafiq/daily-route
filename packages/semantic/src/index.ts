import type { Env } from "@daily-route/env";

import { LocalHashEncoder, OpenAiCompatibleEncoder, type EmbeddingProvider } from "./encoder.js";

export * from "./encoder.js";
export * from "./resolve.js";

/**
 * Pick the embedding provider for the current environment.
 *
 * A remote provider is used whenever one is configured; otherwise the local
 * deterministic encoder keeps place resolution working offline, in CI and in
 * the integration tests.
 */
export function createEmbeddingProvider(env: Env): EmbeddingProvider {
  if (env.EMBEDDINGS_BASE_URL && env.EMBEDDINGS_MODEL) {
    return new OpenAiCompatibleEncoder({
      baseUrl: env.EMBEDDINGS_BASE_URL,
      apiKey: env.EMBEDDINGS_API_KEY ?? "",
      model: env.EMBEDDINGS_MODEL,
      dimensions: env.EMBEDDINGS_DIMENSIONS,
    });
  }
  return new LocalHashEncoder(env.EMBEDDINGS_DIMENSIONS);
}
