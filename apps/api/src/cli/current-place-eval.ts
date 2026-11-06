import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import {
  defineMetric,
  evalExitCode,
  EvalOutcome,
  formatEvalResult,
  llmJudge,
  runEvalSuite,
  type EvalCase,
  type EvalSuiteResult,
  type EvalTarget,
  type EvalTraceRef,
} from "@anvia/core/evals";
import type { Usage } from "@anvia/core";
import { z } from "zod";

import {
  createCompletionModel,
  flushTracing,
  langfuseClient,
  modelConfigFromEnv,
  NetworkCache,
} from "@daily-route/agent";
import {
  createDb,
  deleteUser,
  insertSession,
  insertUser,
  upsertRiderPlace,
} from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";

import { createApp } from "../app.js";
import { createAttemptLimiter } from "../attempts.js";
import type { ApiDeps } from "../deps.js";
import { hashSessionToken } from "../session-cookie.js";
import { createObservedAgent, type ToolObservation } from "./observed-agent.js";

/**
 * An Anvia evaluation of the current-place assistant.
 *
 * The eval target is the real HTTP route, the real planner and the real
 * model. Anvia supplies the runner, the metrics and the report. The LLM
 * judge grades the answer against the case's expected behaviour; two exact
 * metrics check the tool use and the stop names against the tool output.
 * The target agent carries the Langfuse observer, and the API groups every
 * case under the eval run id as its session.
 *
 * Run it with `pnpm --filter @daily-route/api eval:current-place`. It is a
 * manual, live-model eval, not part of `pnpm test`.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });
const context = { db, resolver };
const observed = createObservedAgent({ env, db, context, cache });

const deps: ApiDeps = {
  db,
  env,
  cache,
  resolver,
  agent: observed.agent,
  lastProviderError: null,
  attempts: createAttemptLimiter(100, 15 * 60_000),
  jpos: null,
};
const app = createApp(deps);

type CurrentPlace = {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

type EvalInput = {
  prompt: string;
  current?: CurrentPlace;
  cookie?: string;
};

type TargetOutput = {
  status: number;
  text: string;
  tools: string[];
  cards: number;
  plan: {
    hasRoute: boolean;
    asal: string | null;
    boardingStop: string | null;
    walkMinutes: number | null;
    firstRoute: string[];
    notes: string[];
  } | null;
  allowedFacts: string[];
  usage: Usage | null;
  trace: EvalTraceRef | null;
};

type CaseMeta = {
  requiredTools?: string[];
  forbiddenTools?: string[];
};

type Outcome = {
  status: number;
  text: string;
  tools: string[];
  cards: number;
  error: string | null;
  usage: Usage | null;
  trace: EvalTraceRef | null;
};

function traceOf(value: unknown): EvalTraceRef | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as { observer?: unknown; traceId?: unknown; observationId?: unknown };
  if (typeof entry.observer !== "string" || typeof entry.traceId !== "string") return null;
  return {
    observer: entry.observer,
    traceId: entry.traceId,
    ...(typeof entry.observationId === "string"
      ? { observationId: entry.observationId }
      : {}),
  };
}

function parseSse(raw: string): Omit<Outcome, "status"> {
  let text = "";
  const tools: string[] = [];
  let cards = 0;
  let error: string | null = null;
  let usage: Usage | null = null;
  let trace: EvalTraceRef | null = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const body = line.slice(5).trim();
    if (!body) continue;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      continue;
    }
    const event = payload["event"];
    if (event === "delta" && typeof payload["text"] === "string") {
      text += payload["text"];
    } else if (
      event === "tool" &&
      payload["phase"] === "start" &&
      typeof payload["toolName"] === "string"
    ) {
      tools.push(payload["toolName"]);
    } else if (event === "card") {
      cards += 1;
    } else if (event === "error" && typeof payload["message"] === "string") {
      error = payload["message"];
    } else if (event === "done") {
      if (payload["usage"] && typeof payload["usage"] === "object") {
        usage = payload["usage"] as Usage;
      }
      trace = traceOf(payload["trace"]);
    }
  }
  return { text, tools: [...new Set(tools)], cards, error, usage, trace };
}

async function ask(
  base: string,
  input: EvalInput,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Outcome> {
  const response = await fetch(`${base}/api/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.cookie ? { Cookie: input.cookie } : {}),
    },
    body: JSON.stringify({
      message: input.prompt,
      sessionId,
      ...(input.current ? { current: input.current } : {}),
    }),
    ...(signal ? { signal } : {}),
  });
  const raw = await response.text();
  if (!response.ok) {
    return {
      status: response.status,
      text: raw,
      tools: [],
      cards: 0,
      error: raw,
      usage: null,
      trace: null,
    };
  }
  return { ...parseSse(raw), status: response.status };
}

/** Every string a tool returned, plus the place the browser marked. The
 * judge may only see names from these facts; a name the answer adds itself
 * is not allowed. */
function allowedFactsOf(
  observations: ToolObservation[],
  current: CurrentPlace | undefined,
): string[] {
  const allowed = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.length <= 400) allowed.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) collect(item);
    }
  };
  for (const observation of observations) collect(observation.result);
  if (current) {
    allowed.add(current.name);
    if (current.address) allowed.add(current.address);
  }
  return [...allowed];
}

function planOf(observations: ToolObservation[]): TargetOutput["plan"] {
  const plan = observations.findLast((entry) => entry.tool === "plan_journey");
  if (!plan || !plan.result || typeof plan.result !== "object") return null;
  const entry = plan.result as {
    asal?: { name?: unknown; text?: unknown; jalanKaki?: { menit?: unknown } | null };
    rute?: { legs?: { dari?: unknown; ke?: unknown }[] }[];
    catatan?: unknown;
  };
  const first = entry.rute?.[0];
  return {
    hasRoute: Boolean(first),
    asal: typeof entry.asal?.text === "string" ? entry.asal.text : null,
    boardingStop: typeof entry.asal?.name === "string" ? entry.asal.name : null,
    walkMinutes:
      typeof entry.asal?.jalanKaki?.menit === "number" ? entry.asal.jalanKaki.menit : null,
    firstRoute: Array.isArray(first?.legs)
      ? first.legs.map((leg) => `${String(leg.dari)} → ${String(leg.ke)}`)
      : [],
    notes: Array.isArray(entry.catatan)
      ? entry.catatan.filter((note): note is string => typeof note === "string")
      : [],
  };
}

function metaOf(testCase: EvalCase<EvalInput, string>): CaseMeta {
  return (testCase.metadata ?? {}) as CaseMeta;
}

async function main(): Promise<void> {
  const runId = `current-place-eval:${new Date().toISOString()}`;
  const { network } = await cache.get();
  const station = network.stations.find(
    (candidate) => candidate.name === "Bundaran HI ASTRA",
  );
  if (!station) {
    throw new Error("The eval needs the Bundaran HI ASTRA station as its current place.");
  }

  const here: CurrentPlace = {
    name: "Bundaran HI",
    address: "Jalan M.H. Thamrin, Kebon Melati, Jakarta Pusat",
    latitude: station.latitude,
    longitude: station.longitude,
  };

  const email = `fixture_eval_${randomUUID()}@example.test`;
  const created = await insertUser(db, { email, passwordHash: "test-hash" });
  if (!created.ok) throw new Error("The eval user could not be created.");
  const token = `fixture_eval_${randomUUID()}`;
  await insertSession(db, {
    userId: created.user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const cookie = `dr_session=${token}`;

  const saved = await upsertRiderPlace(db, created.user.id, {
    label: "Home",
    payload: {
      kind: "place",
      id: `fixture_eval_place_${randomUUID()}`,
      name: "Bundaran HI",
      address: here.address,
      latitude: here.latitude,
      longitude: here.longitude,
      systemId: null,
      systemName: null,
    },
  });
  if (!saved.ok) throw new Error("The eval saved place could not be written.");

  const cases: EvalCase<EvalInput, string>[] = [
    {
      id: "route-from-here",
      expected:
        "Start from the marked current place. Call plan_journey, walk to the boarding stop the tool chose, describe only the first returned route, and do not ask the rider to mark the location.",
      metadata: { requiredTools: ["plan_journey"] },
      input: {
        prompt: "How do I get from here to Kelapa Gading? Is anything closed?",
        current: here,
      },
    },
    {
      id: "where-am-i",
      expected:
        "Say the rider is at Bundaran HI on Jalan M.H. Thamrin, Jakarta Pusat and name a nearby stop. Do not plan a journey.",
      metadata: { forbiddenTools: ["plan_journey"] },
      input: { prompt: "Where am I right now, and which stop is nearest?", current: here },
    },
    {
      id: "no-current-place",
      expected:
        "Do not plan a journey. Ask the rider to press Use my location in the From field or give a starting point.",
      metadata: { forbiddenTools: ["plan_journey"] },
      input: { prompt: "How do I get from here to Kota?" },
    },
    {
      id: "outside-jabodetabek",
      expected:
        "Do not plan a journey. Say the current position is outside Jabodetabek and ask for a starting point. A clearly hypothetical example of a start name is allowed.",
      metadata: { forbiddenTools: ["plan_journey"] },
      input: {
        prompt: "How do I get from here to Kota?",
        current: {
          name: "Paris",
          address: "Paris, France",
          latitude: 48.8566,
          longitude: 2.3522,
        },
      },
    },
    {
      id: "no-destination",
      expected: "Do not plan a journey. Ask for a destination.",
      metadata: { forbiddenTools: ["plan_journey"] },
      input: { prompt: "How do I get from here?", current: here },
    },
    {
      id: "saved-home",
      expected:
        "Call list_my_places and plan_journey. Start from the saved Home at Bundaran HI, not from a different stop.",
      metadata: { requiredTools: ["list_my_places", "plan_journey"] },
      input: { prompt: "Take me from Home to Kelapa Gading.", current: here, cookie },
    },
    {
      id: "too-far-from-stop",
      expected:
        "Say there is no stop within walking distance of the marked place and do not invent a route. Asking for another starting point is correct.",
      metadata: { forbiddenTools: [] },
      input: {
        prompt: "How do I get from here to Kota?",
        current: {
          name: "A field outside the serviced area",
          address: "A field outside the serviced area",
          latitude: -6.6,
          longitude: 106.4,
        },
      },
    },
  ];

  const requiredTools = defineMetric<EvalInput, TargetOutput, boolean, string>({
    name: "tool_use",
    dataType: "BOOLEAN",
    direction: "higher_is_better",
    threshold: 1,
    evaluate({ case: testCase, output }) {
      const meta = metaOf(testCase);
      const missing = (meta.requiredTools ?? []).filter(
        (tool) => !output.tools.includes(tool),
      );
      const forbidden = (meta.forbiddenTools ?? []).filter((tool) =>
        output.tools.includes(tool),
      );
      if (missing.length > 0 || forbidden.length > 0) {
        return EvalOutcome.fail(false, {
          comment: `missing: ${missing.join(", ") || "-"}; forbidden: ${forbidden.join(", ") || "-"}`,
        });
      }
      return EvalOutcome.pass(true);
    },
  });

  const systemStopNames = network.stations
    .map((candidate) => candidate.name)
    .filter((name) => name.length >= 5);

  const groundedStops = defineMetric<EvalInput, TargetOutput, boolean, string>({
    name: "grounded_stops",
    dataType: "BOOLEAN",
    direction: "higher_is_better",
    threshold: 1,
    evaluate({ output }) {
      if (!output.plan?.hasRoute) {
        return EvalOutcome.pass(true, {
          comment: "No route was returned, so there is no stop to ground.",
        });
      }
      const allowedText = output.allowedFacts.join(" | ");
      const invented = systemStopNames.filter(
        (name) => !allowedText.includes(name) && output.text.includes(name),
      );
      if (invented.length > 0) {
        return EvalOutcome.fail(false, {
          comment: `Named without a plan: ${invented.join(", ")}`,
        });
      }
      return EvalOutcome.pass(true, { comment: "Every named stop came from a tool result." });
    },
  });

  type JudgeResult = {
    pass: boolean;
    reason: string;
    invented_stop: boolean;
  };

  const judge = llmJudge<EvalInput, TargetOutput, JudgeResult, string>({
    name: "answer_quality",
    model: createCompletionModel(modelConfigFromEnv(env), "chat"),
    schema: z.object({
      pass: z.boolean(),
      reason: z.string(),
      invented_stop: z.boolean(),
    }),
    passes: (value) => value.pass && !value.invented_stop,
    instructions:
      "You are grading a Greater Jakarta transit assistant. Use only the answer, the tools and the plan evidence in the prompt. Pass only when the answer does what Expected behaviour asks, uses the tools the case needs (or avoids the tools it forbids), and does not name a transit stop that is absent from Allowed stop names. A route may be described in the rider's language. Do not fail for extra helpful detail that is supported by the plan. Return a short reason and invented_stop=true only when the answer names a stop outside Allowed stop names.",
    prompt: ({ case: testCase, output }) =>
      [
        `Case: ${testCase.id}`,
        `Rider: ${testCase.input.prompt}`,
        `Expected behaviour: ${testCase.expected}`,
        `Answer: ${output.text}`,
        `Tools used: ${output.tools.join(", ") || "-"}`,
        `Plan evidence: ${JSON.stringify(output.plan)}`,
        `Allowed names from tools: ${output.allowedFacts.join(", ") || "-"}`,
      ].join("\n\n"),
  });

  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The eval server did not get a port.");
  }
  const base = `http://127.0.0.1:${address.port}`;

  const tracing = langfuseClient(env);
  const target: EvalTarget<EvalInput, TargetOutput, string> = async (
    input,
    testCase,
    targetContext,
  ) => {
    observed.observations.length = 0;
    const outcome = await ask(
      base,
      input,
      `${runId}:${testCase.id}`,
      targetContext?.signal,
    );
    return {
      status: outcome.status,
      text: outcome.text,
      tools: outcome.tools,
      cards: outcome.cards,
      plan: planOf(observed.observations),
      allowedFacts: allowedFactsOf(observed.observations, input.current),
      usage: outcome.usage,
      trace: outcome.trace,
    };
  };

  let result: EvalSuiteResult<EvalInput, TargetOutput, string> | null = null;
  try {
    result = await runEvalSuite({
      name: "current-place-agent",
      run: {
        id: runId,
        datasetName: "current-place",
        datasetVersion: "2026-11-05",
        metadata: { model: env.AGENT_MODEL },
      },
      cases,
      target,
      metrics: [requiredTools, groundedStops, judge],
      targetUsage: ({ output }) => output.usage ?? undefined,
      trace: ({ output }) => output?.trace ?? undefined,
      reporters: tracing
        ? [tracing.evalReporter<EvalInput, TargetOutput, string>({ onMissingTrace: "warn" })]
        : [],
      concurrency: 1,
      targetConcurrency: 1,
      metricConcurrency: 2,
      caseTimeoutMs: 180_000,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await deleteUser(db, created.user.id);
    await flushTracing();
    await db.$client.end({ timeout: 5 });
  }

  if (!result) throw new Error("The eval did not return a result.");
  const printed = formatEvalResult(
    result as unknown as EvalSuiteResult<unknown, unknown, unknown>,
  );
  process.stdout.write(`${printed}\n`);
  process.stdout.write(`Langfuse session prefix: ${runId}\n`);

  const report = {
    at: new Date().toISOString(),
    model: env.AGENT_MODEL,
    langfuseSessionPrefix: runId,
    cases: result.cases,
    metrics: result.metrics,
    usage: result.usage,
    durationMs: result.durationMs,
    results: result.results.map((entry) => ({
      id: entry.case.id,
      outcome: entry.outcome,
      targetStatus: entry.targetStatus,
      targetError: entry.targetError instanceof Error ? entry.targetError.message : null,
      text: entry.output?.text ?? null,
      tools: entry.output?.tools ?? [],
      plan: entry.output?.plan ?? null,
      trace: entry.output?.trace ?? null,
      scores: Object.fromEntries(
        Object.entries(entry.metrics).map(([name, metric]) => [
          name,
          {
            outcome: metric.outcome.outcome,
            score: metric.outcome.score ?? null,
            comment: metric.outcome.comment ?? null,
          },
        ]),
      ),
    })),
  };
  writeFileSync(
    new URL("../../../../research/current-place-eval.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  process.exitCode = evalExitCode(
    result as unknown as EvalSuiteResult<unknown, unknown, unknown>,
  );
}

await main();
