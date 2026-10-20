/**
 * Embedding providers.
 *
 * The platform never assumes a single vendor. A provider is anything that
 * turns text into a fixed-width vector; the local encoder keeps the system
 * working (and testable) without an API key, and a remote provider is used
 * as soon as one is configured.
 */

export type EmbeddingProvider = {
  /** Stable identifier stored next to the vector, so a model change is visible. */
  readonly model: string;
  /** The width of the produced vectors. */
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<number[][]>;
};

export class EmbeddingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

/**
 * The deterministic, offline encoder.
 *
 * It maps character n-grams and word n-grams into a hashed vector space
 * ("hashing trick"), then L2-normalises it. Two texts that share vocabulary
 * land close together, which makes plain cosine similarity in Postgres a
 * usable lexical matcher — and it needs no key, no network and no GPU.
 */
export class LocalHashEncoder implements EmbeddingProvider {
  readonly model = "local/hash-ngram-v1";
  readonly dimensions: number;

  constructor(dimensions = 768) {
    this.dimensions = dimensions;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Float64Array(this.dimensions);
    const normalized = text.toLowerCase().trim();
    if (normalized.length === 0) return Array.from(vector);

    const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 0);

    for (const token of tokens) {
      this.#accumulate(vector, token, 1);
      for (let index = 0; index < token.length - 2; index += 1) {
        this.#accumulate(vector, token.slice(index, index + 3), 0.6);
      }
    }

    for (let index = 0; index < tokens.length - 1; index += 1) {
      this.#accumulate(vector, `${tokens[index]}~${tokens[index + 1]}`, 0.8);
    }

    let magnitude = 0;
    for (const value of vector) magnitude += value * value;
    magnitude = Math.sqrt(magnitude);
    if (magnitude === 0) return Array.from(vector);
    return Array.from(vector, (value) => value / magnitude);
  }

  #accumulate(vector: Float64Array, token: string, weight: number): void {
    const hash = fnv1a(token);
    const bucket = hash % this.dimensions;
    // The sign bit keeps unrelated collisions from always adding up.
    const sign = (hash & 0x8000) === 0 ? 1 : -1;
    vector[bucket] = (vector[bucket] ?? 0) + sign * weight;
  }
}

/** FNV-1a, 32 bit. Small, fast and stable across runs and platforms. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * An OpenAI-compatible `/embeddings` client.
 *
 * OpenRouter exposes the same shape, so one adapter covers OpenAI, OpenRouter
 * and any self-hosted compatible gateway.
 */
export class OpenAiCompatibleEncoder implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #batchSize: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dimensions: number;
    batchSize?: number;
  }) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#apiKey = options.apiKey;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.#batchSize = options.batchSize ?? 64;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let index = 0; index < texts.length; index += this.#batchSize) {
      const batch = texts.slice(index, index + this.#batchSize);
      vectors.push(...(await this.#embedBatch(batch)));
    }
    return vectors;
  }

  async #embedBatch(inputs: readonly string[]): Promise<number[][]> {
    const response = await fetch(`${this.#baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: [...inputs] }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new EmbeddingError(
        `Embeddings request failed with ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };
    const data = payload.data ?? [];
    if (data.length !== inputs.length) {
      throw new EmbeddingError(
        `Embeddings response returned ${data.length} vectors for ${inputs.length} inputs`,
      );
    }

    return data.map((item) => {
      const embedding = item.embedding ?? [];
      if (embedding.length !== this.dimensions) {
        throw new EmbeddingError(
          `Embeddings model ${this.model} returned ${embedding.length} dimensions, expected ${this.dimensions}`,
        );
      }
      return embedding;
    });
  }
}
