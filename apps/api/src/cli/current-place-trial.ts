import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { flushTracing, NetworkCache } from "@daily-route/agent";
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
 * The real-model trial of the current-place feature.
 *
 * It starts the real HTTP API with the configured model, sends the same
 * SSE request the browser sends, and checks the tool it used and the shape
 * of the answer. It is not part of `pnpm test`: a live model costs money and
 * changes its wording. Run it with `pnpm --filter @daily-route/api
 * trial:current-place`, which loads the root `.env`.
 *
 * The X API is not touched. The chat path is the planner and the model; the
 * monitor's stream is a separate process.
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

type Scenario = {
  name: string;
  prompt: string;
  current?: CurrentPlace;
  cookie?: string;
  expect: {
    tools?: string[];
    toolsAbsent?: string[];
    mustMatch: RegExp[];
    mustNotMatch?: RegExp[];
    minCards?: number;
    /** The answer may only name stops the plan tool returned. */
    strictPlan?: boolean;
  };
};

type Outcome = {
  status: number;
  text: string;
  tools: string[];
  cards: number;
  error: string | null;
  usage: unknown;
};

type Check = { label: string; pass: boolean };

type ScenarioResult = {
  name: string;
  prompt: string;
  pass: boolean;
  checks: Check[];
  outcome: Outcome;
  observations: ToolObservation[];
};

function parseSse(raw: string): Outcome {
  let text = "";
  const tools: string[] = [];
  let cards = 0;
  let error: string | null = null;
  let usage: unknown = null;

  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const body = line.slice(5).trim();
    if (body.length === 0) continue;
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
      usage = payload["usage"] ?? null;
    }
  }

  return { status: 200, text, tools: [...new Set(tools)], cards, error, usage };
}

async function ask(
  base: string,
  scenario: Scenario,
  sessionId: string,
): Promise<Outcome> {
  const response = await fetch(`${base}/api/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(scenario.cookie ? { Cookie: scenario.cookie } : {}),
    },
    body: JSON.stringify({
      message: scenario.prompt,
      sessionId,
      ...(scenario.current ? { current: scenario.current } : {}),
    }),
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
    };
  }
  return { ...parseSse(raw), status: response.status };
}

/** The stop names a returned route is allowed to mention. */
function allowedStops(result: unknown): Set<string> {
  const allowed = new Set<string>();
  if (!result || typeof result !== "object") return allowed;
  const entry = result as {
    asal?: { name?: unknown; dari?: unknown; text?: unknown };
    tujuan?: { name?: unknown; text?: unknown };
    rute?: unknown;
  };
  for (const value of [
    entry.asal?.name,
    entry.asal?.dari,
    entry.tujuan?.name,
    entry.tujuan?.text,
  ]) {
    if (typeof value === "string") allowed.add(value);
  }
  const asalText = entry.asal?.text;
  if (typeof asalText === "string") allowed.add(asalText);
  if (!Array.isArray(entry.rute)) return allowed;
  for (const route of entry.rute) {
    if (!route || typeof route !== "object") continue;
    const legs = (route as { legs?: unknown }).legs;
    if (!Array.isArray(legs)) continue;
    for (const leg of legs) {
      if (!leg || typeof leg !== "object") continue;
      const item = leg as {
        dari?: unknown;
        ke?: unknown;
        halte?: unknown;
        lineName?: unknown;
        labelArah?: unknown;
      };
      for (const value of [item.dari, item.ke, item.lineName, item.labelArah]) {
        if (typeof value === "string") allowed.add(value);
      }
      if (Array.isArray(item.halte)) {
        for (const stop of item.halte) {
          if (typeof stop === "string") allowed.add(stop);
        }
      }
    }
  }
  return allowed;
}

function check(
  scenario: Scenario,
  outcome: Outcome,
  observations: readonly ToolObservation[],
  network: { stations: readonly { name: string }[] },
): Check[] {
  const checks: Check[] = [];
  const text = outcome.text;
  const tools = new Set(outcome.tools);

  checks.push({ label: "HTTP 200", pass: outcome.status === 200 });
  checks.push({ label: "no stream error", pass: outcome.error === null });
  checks.push({ label: "answer is not empty", pass: text.trim().length > 0 });

  for (const name of scenario.expect.tools ?? []) {
    checks.push({ label: `used ${name}`, pass: tools.has(name) });
  }
  for (const name of scenario.expect.toolsAbsent ?? []) {
    checks.push({ label: `did not use ${name}`, pass: !tools.has(name) });
  }
  for (const pattern of scenario.expect.mustMatch) {
    checks.push({ label: `matches ${pattern}`, pass: pattern.test(text) });
  }
  for (const pattern of scenario.expect.mustNotMatch ?? []) {
    checks.push({ label: `does not match ${pattern}`, pass: !pattern.test(text) });
  }
  if (scenario.expect.minCards !== undefined) {
    checks.push({
      label: `at least ${scenario.expect.minCards} cards`,
      pass: outcome.cards >= scenario.expect.minCards,
    });
  }
  if (scenario.expect.strictPlan === true) {
    const plan = [...observations].reverse().find((entry) => entry.tool === "plan_journey");
    if (plan) {
      const allowed = allowedStops(plan.result);
      const allowedText = [...allowed].join(" | ");
      const invented = network.stations
        .map((station) => station.name)
        .filter(
          (name) => name.length >= 5 && !allowedText.includes(name) && text.includes(name),
        );
      checks.push({
        label: `names only stops from the plan (${invented.join(", ") || "none"})`,
        pass: invented.length === 0,
      });
    }
  }
  return checks;
}

function currentAt(
  station: { latitude: number; longitude: number; name: string },
  name: string,
  address: string,
): CurrentPlace {
  return {
    name,
    address,
    latitude: station.latitude,
    longitude: station.longitude,
  };
}

async function main(): Promise<void> {
  const sessionId = `current-place-trial:${new Date().toISOString()}`;
  const { network } = await cache.get();
  const station = network.stations.find(
    (candidate) => candidate.name === "Bundaran HI ASTRA",
  );
  if (!station) {
    throw new Error("The trial needs the Bundaran HI ASTRA station as its current place.");
  }

  const here = currentAt(
    station,
    "Bundaran HI",
    "Jalan M.H. Thamrin, Kebon Melati, Jakarta Pusat",
  );

  const email = `fixture_trial_${randomUUID()}@example.test`;
  const created = await insertUser(db, { email, passwordHash: "test-hash" });
  if (!created.ok) throw new Error("The trial user could not be created.");
  const token = `fixture_trial_${randomUUID()}`;
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
      id: `fixture_trial_place_${randomUUID()}`,
      name: "Bundaran HI",
      address: "Jalan M.H. Thamrin, Kebon Melati, Jakarta Pusat",
      latitude: station.latitude,
      longitude: station.longitude,
      systemId: null,
      systemName: null,
    },
  });
  if (!saved.ok) throw new Error("The trial saved place could not be written.");

  const scenarios: Scenario[] = [
    {
      name: "route from the marked current place",
      prompt: "How do I get from here to Kelapa Gading? Is anything closed?",
      current: here,
      expect: {
        tools: ["plan_journey"],
        mustMatch: [/Kelapa Gading/i, /(min|Rp|corridor|line|stop)/i],
        minCards: 1,
        strictPlan: true,
      },
    },
    {
      name: "where the rider is",
      prompt: "Where am I right now, and which stop is nearest?",
      current: here,
      expect: {
        mustMatch: [/(Bundaran|Thamrin|Jakarta Pusat)/i],
      },
    },
    {
      name: "no current place is marked",
      prompt: "How do I get from here to Kota?",
      expect: {
        toolsAbsent: ["plan_journey"],
        mustMatch: [/(location|from field|where you are|mark)/i],
      },
    },
    {
      name: "current place outside Jabodetabek",
      prompt: "How do I get from here to Kota?",
      current: {
        name: "Paris",
        address: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
      },
      expect: {
        toolsAbsent: ["plan_journey"],
        mustMatch: [/(outside|Jabodetabek|not on this network|cannot)/i],
      },
    },
    {
      name: "current place with no destination",
      prompt: "How do I get from here?",
      current: here,
      expect: {
        toolsAbsent: ["plan_journey"],
        mustMatch: [/(where|destination|going|tujuan)/i],
      },
    },
    {
      name: "saved current place used by its label",
      prompt: "How do I get from Home to Kelapa Gading?",
      cookie,
      expect: {
        tools: ["list_my_places", "plan_journey"],
        mustMatch: [/(Home|Kelapa Gading)/i, /(min|Rp|corridor|line|stop)/i],
        strictPlan: true,
      },
    },
    {
      name: "current place too far from a stop",
      prompt: "How do I get from here to Kota?",
      current: {
        name: "A field outside the serviced area",
        address: "A field outside the serviced area",
        latitude: -6.6,
        longitude: 106.4,
      },
      expect: {
        mustMatch: [/(no stop|not within|too far|walk|halte|route)/i],
      },
    },
  ];

  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The trial server did not get a port.");
  }
  const base = `http://127.0.0.1:${address.port}`;

  const results: ScenarioResult[] = [];
  try {
    for (const scenario of scenarios) {
      process.stdout.write(`\n=== ${scenario.name}\n`);
      observed.observations.length = 0;
      const outcome = await ask(base, scenario, sessionId);
      for (const observation of observed.observations) {
        process.stdout.write(
          `tool ${observation.tool} ${JSON.stringify(observation.args)}\n`,
        );
        if (observation.tool === "plan_journey") {
          const result = observation.result as {
            asal?: unknown;
            rute?: { durasiMenit?: unknown; legs?: { dari?: unknown; ke?: unknown }[] }[];
            catatan?: unknown;
          };
          process.stdout.write(
            `  asal ${JSON.stringify(result.asal)} notes ${JSON.stringify(result.catatan)}\n`,
          );
          process.stdout.write(
            `  first ${JSON.stringify(result.rute?.[0]?.legs?.map((leg) => `${String(leg.dari)}->${String(leg.ke)}`))} duration ${String(result.rute?.[0]?.durasiMenit)}\n`,
          );
        }
      }
      const checks = check(scenario, outcome, observed.observations, network);
      const pass = checks.every((entry) => entry.pass);
      results.push({
        name: scenario.name,
        prompt: scenario.prompt,
        pass,
        checks,
        outcome,
        observations: [...observed.observations],
      });
      process.stdout.write(`pass: ${pass}\n`);
      for (const entry of checks.filter((item) => !item.pass)) {
        process.stdout.write(`  FAIL ${entry.label}\n`);
      }
      process.stdout.write(`tools: ${outcome.tools.join(", ") || "-"}\n`);
      process.stdout.write(`answer: ${outcome.text.replace(/\s+/g, " ").trim()}\n`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await deleteUser(db, created.user.id);
    await flushTracing();
    await db.$client.end({ timeout: 5 });
  }

  const passed = results.filter((result) => result.pass).length;
  const report = {
    at: new Date().toISOString(),
    model: env.AGENT_MODEL,
    sessionId,
    passed,
    total: results.length,
    results,
  };
  writeFileSync(
    new URL("../../../../research/current-place-trial.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`\nLangfuse session: ${sessionId}\n`);
  process.stdout.write(`${passed}/${results.length} scenarios passed.\n`);
  if (passed !== results.length) process.exitCode = 1;
}

await main();
