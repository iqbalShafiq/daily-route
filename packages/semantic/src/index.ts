import type { Env } from "@daily-route/env";

import { OpenAiCompatibleEncoder, UnavailableEmbeddingProvider, type EmbeddingProvider } from "./encoder.js";

export * from "./encoder.js";
export * from "./resolve.js";
export * from "./roads.js";

/**
 * Pick the embedding provider for the current environment.
 *
 * A remote provider is used whenever one is configured. Without one, lookup
 * stays on the lexical and exact channels. A hash of the letters is not
 * substituted for a semantic vector.
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
  return new UnavailableEmbeddingProvider(env.EMBEDDINGS_DIMENSIONS);
}
