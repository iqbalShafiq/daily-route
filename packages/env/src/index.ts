import { z } from "zod";

/**
 * The one place that knows what the environment looks like.
 *
 * Every workspace package reads the same root `.env` (loaded by `dotenv-cli`
 * before the process starts) and validates it here, so a missing or
 * malformed variable fails at the boundary with a named cause instead of
 * surfacing as `undefined` deep inside a request handler.
 */

const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const portSchema = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),

  API_PORT: portSchema.default(3001),
  WEB_PORT: portSchema.default(3000),
  WORKER_PORT: portSchema.default(4002),
  WEB_ORIGIN: z.string().trim().url().default("http://localhost:3000"),

  AGENT_BASE_URL: z.string().trim().url().default("https://openrouter.ai/api/v1"),
  AGENT_API_KEY: optionalSecret,
  AGENT_MODEL: z.string().trim().min(1).default("openai/gpt-4o-mini"),
  /**
   * The decision model that screens announcements.
   *
   * It is a TypeSafe Jev id on OpenRouter, not a chat model. Chat
   * completions reject it.
   */
  JEV_MODEL: z.string().trim().min(1).default("typesafe/jev-1.14"),

  EMBEDDINGS_BASE_URL: optionalSecret,
  EMBEDDINGS_API_KEY: optionalSecret,
  EMBEDDINGS_MODEL: optionalSecret,
  EMBEDDINGS_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(768),

  TAVILY_API_KEY: optionalSecret,

  X_BEARER_TOKEN: optionalSecret,
  X_API_BASE_URL: z.string().trim().url().default("https://api.x.com"),
  /** How long the classifier may work before a tick returns. */
  CLASSIFY_BUDGET_MS: z.coerce.number().int().min(10_000).max(1_800_000).default(240_000),
  /** How long a claimed queue row stays leased. */
  CLASSIFY_LEASE_MS: z.coerce.number().int().min(30_000).default(600_000),
  /** How many queue items are read concurrently. */
  CLASSIFY_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  /** How many open notices a tick re-checks. */
  NOTICE_SWEEP_LIMIT: z.coerce.number().int().min(0).max(20).default(4),

  WORKER_CRON_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  LANGFUSE_PUBLIC_KEY: optionalSecret,
  LANGFUSE_SECRET_KEY: optionalSecret,
  LANGFUSE_BASE_URL: optionalSecret,
  /** Accepted when the host is set under Langfuse's older variable name. */
  LANGFUSE_HOST: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate the environment.
 *
 * The error message names every offending variable so a single run fixes the
 * whole configuration.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration — ${issues}`);
}

/** Whether an OpenAI-compatible embeddings endpoint is configured. */
export function hasRemoteEmbeddings(env: Env): boolean {
  return env.EMBEDDINGS_BASE_URL !== undefined && env.EMBEDDINGS_MODEL !== undefined;
}

/** Whether the agentic model provider is configured. */
export function hasAgentProvider(env: Env): boolean {
  return env.AGENT_API_KEY !== undefined;
}

/** Whether the X monitor can run. */
export function hasXCredentials(env: Env): boolean {
  return env.X_BEARER_TOKEN !== undefined;
}

/** Whether news research is available. */
export function hasTavily(env: Env): boolean {
  return env.TAVILY_API_KEY !== undefined;
}
