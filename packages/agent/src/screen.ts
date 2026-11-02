import { check, choice, decide } from "@anvia/core/decision";
import { JevClient, type JevDecisionModelHandle } from "@anvia/jev";

import type { Env } from "@daily-route/env";
import type { Line } from "@daily-route/transit";

import { acceptedMark, type IncidentMark } from "./marks.js";
import { recordUsage } from "./usage.js";
import { OPENROUTER_REFERER } from "./model.js";

/**
 * A typed screen over one announcement.
 *
 * Jev answers closed questions. It does not write the notice the rider
 * reads, and it does not invent a halte id. A corridor is offered only
 * after the text already names that corridor.
 */

export const DISRUPTION_PROBABILITY = 0.22;
export const RESTORED_PROBABILITY = 0.55;
export const SYSTEM_CONFIDENCE = 0.45;
export const CORRIDOR_THRESHOLD = 0.62;

const SYSTEMS = [
  "transjakarta",
  "mrt-jakarta",
  "lrt-jakarta",
  "lrt-jabodebek",
  "krl-jabodetabek",
] as const;

export type NetworkSystemId = (typeof SYSTEMS)[number];

export type AnnouncementScreenInput = {
  text: string;
  systemHint: string | null;
  publishedAt?: Date;
};

/** The three cheap questions every announcement is screened on. */
export type BaseJudgement = {
  disruptionProbability: number;
  restoredProbability: number;
  systemId: NetworkSystemId | null;
};

/** The expensive questions, asked only when the chat model will read it. */
export type Enrichment = {
  lineIds: string[];
  /** The case icon, when Jev is confident. Null when it is not. */
  mark: IncidentMark | null;
};

export type AnnouncementJudgement = BaseJudgement & Enrichment;

export type AnnouncementScreen = {
  /** Three questions: disruption, restoration, system. */
  screen(input: AnnouncementScreenInput): Promise<BaseJudgement>;
  /** Mark and corridor checks, only for an item that passed the screen. */
  enrich(
    input: AnnouncementScreenInput & { corridors: readonly { id: string; label: string }[] },
  ): Promise<Enrichment>;
  /** Both stages, for callers that do not need the split. */
  judge(
    input: AnnouncementScreenInput & { corridors: readonly { id: string; label: string }[] },
  ): Promise<AnnouncementJudgement>;
  /** One choice, for notices that are already stored. */
  chooseMark(text: string): Promise<IncidentMark | null>;
  /** One check, for a later post that may say the service is back. */
  restoredProbability(text: string): Promise<number>;
};

/** The chat model still has to read this announcement. */
export function needsClassifier(judgement: BaseJudgement): boolean {
  return (
    judgement.disruptionProbability >= DISRUPTION_PROBABILITY ||
    judgement.restoredProbability >= RESTORED_PROBABILITY
  );
}

/**
 * Corridors the announcement itself names.
 *
 * A one- or two-character code counts only next to "koridor", "rute",
 * or "jalur", so a stray "1" does not mark every corridor 1.
 */
export function corridorCandidates(text: string, lines: readonly Line[], limit = 20): Line[] {
  const found: Line[] = [];
  for (const line of lines) {
    if (line.status !== "operating") continue;
    if (!mentionsLine(text, line)) continue;
    found.push(line);
    if (found.length >= limit) break;
  }
  return found;
}

function mentionsLine(text: string, line: Line): boolean {
  if (codeMentioned(text, line.code)) return true;
  const name = line.name.trim();
  return name.length >= 6 && text.toLowerCase().includes(name.toLowerCase());
}

function codeMentioned(text: string, code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length === 0) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const distinctive = trimmed.length >= 3 || (/[A-Za-z]/.test(trimmed) && /\d/.test(trimmed));
  if (distinctive) {
    return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, "i").test(text);
  }
  return new RegExp(`(?:koridor|rute|jalur)\\s+${escaped}(?:[^A-Za-z0-9]|$)`, "i").test(text);
}

/**
 * OpenRouter's System One route.
 *
 * The TypeSafe SDK appends `/v1/systemone`. The chat base URL already
 * ends in `/v1`, so the decision client stops at `/api`.
 */
export function systemOneBase(agentBaseUrl: string): string {
  const url = new URL(agentBaseUrl);
  if (url.hostname.endsWith("openrouter.ai")) return `${url.origin}/api`;
  return agentBaseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
}

export function createAnnouncementScreen(env: Env): AnnouncementScreen | null {
  if (!env.AGENT_API_KEY) return null;
  const client = new JevClient({
    apiKey: env.AGENT_API_KEY,
    baseUrl: systemOneBase(env.AGENT_BASE_URL),
    headers: {
      "HTTP-Referer": OPENROUTER_REFERER,
      "X-OpenRouter-Title": "Daily Route",
    },
  });
  return new JevAnnouncementScreen(client.decisionModel({ modelId: env.JEV_MODEL }), env.JEV_MODEL);
}

export class JevAnnouncementScreen implements AnnouncementScreen {
  readonly #model: JevDecisionModelHandle;
  readonly #modelId: string | null;

  constructor(model: JevDecisionModelHandle, modelId: string | null = null) {
    this.#model = model;
    this.#modelId = modelId;
  }

  /** Jev is a paid call too; keep it next to the classifier in the ledger. */
  #record(
    result: { usage?: { inputTokens: number; outputTokens: number } | undefined },
    operation: string,
    started: number,
  ): void {
    if (!this.#modelId) return;
    recordUsage({
      kind: "ai",
      provider: "typesafe",
      operation,
      model: this.#modelId,
      providerName: "TypeSafe",
      promptTokens: result.usage?.inputTokens ?? 0,
      completionTokens: result.usage?.outputTokens ?? 0,
      costUsd: 0,
      latencyMs: Date.now() - started,
      status: "ok",
    });
  }

  async screen(input: AnnouncementScreenInput): Promise<BaseJudgement> {
    const started = Date.now();
    const result = await decide({
      model: this.#model,
      state: {
        text: input.text.slice(0, 6_000),
        operator: input.systemHint,
        publishedAt: input.publishedAt?.toISOString() ?? null,
      },
      questions: {
        disruption: check({
          instructions:
            "Does `text` announce a disruption, diversion, closure, delay, or service change on Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, or KRL Jabodetabek? A normal timetable, a promotion, an event notice, or a disruption in another city is not a disruption on this network.",
        }),
        restored: check({
          instructions:
            "Does `text` say that a previously disrupted service on Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, or KRL Jabodetabek is back to normal?",
        }),
        system: choice({
          instructions: "Which network does `text` concern? Choose lain when it is none of these.",
          options: {
            transjakarta: "Transjakarta buses and corridors",
            "mrt-jakarta": "MRT Jakarta",
            "lrt-jakarta": "LRT Jakarta",
            "lrt-jabodebek": "LRT Jabodebek",
            "krl-jabodetabek": "KRL Jabodetabek",
            lain: "Another operator, another city, or no transit disruption",
          },
        }),
      },
      retries: { maxAttempts: 2 },
      abortSignal: AbortSignal.timeout(30_000),
    });

    this.#record(result, "screen", started);
    const answers = result.answers as unknown as Record<
      string,
      { probability?: number; choice?: string; confidence?: number }
    >;
    const choiceId = answers["system"]?.choice;
    const confidence = answers["system"]?.confidence ?? 0;
    return {
      disruptionProbability: clamp(answers["disruption"]?.probability),
      restoredProbability: clamp(answers["restored"]?.probability),
      systemId:
        isNetworkSystem(choiceId) && confidence >= SYSTEM_CONFIDENCE ? choiceId : null,
    };
  }

  async enrich(
    input: AnnouncementScreenInput & { corridors: readonly { id: string; label: string }[] },
  ): Promise<Enrichment> {
    const started = Date.now();
    const corridors = input.corridors.slice(0, 12);
    const corridorKeys = corridors.map((corridor, index) => ({
      key: `corridor${index}`,
      id: corridor.id,
      label: corridor.label,
    }));
    // One check per corridor. `@anvia/jev` 0.2 turns a multi-label into a
    // noul whose criteria omit `false`, and the TypeSafe SDK rejects that.
    const corridorQuestions = Object.fromEntries(
      corridorKeys.map((corridor) => [
        corridor.key,
        check({
          instructions: `Does \`text\` say that ${corridor.label} (\`corridors.${corridor.key}\`) is disrupted, diverted, delayed, or closed?`,
        }),
      ]),
    );

    const result = await decide({
      model: this.#model,
      state: {
        text: input.text.slice(0, 6_000),
        operator: input.systemHint,
        publishedAt: input.publishedAt?.toISOString() ?? null,
        corridors: Object.fromEntries(corridorKeys.map((corridor) => [corridor.key, corridor.label])),
      },
      questions: {
        mark: markQuestion(),
        ...corridorQuestions,
      },
      retries: { maxAttempts: 2 },
      abortSignal: AbortSignal.timeout(30_000),
    });

    this.#record(result, "screen_enrich", started);
    const answers = result.answers as unknown as Record<
      string,
      { probability?: number; choice?: string; confidence?: number }
    >;
    return {
      lineIds: corridorKeys
        .filter((corridor) => clamp(answers[corridor.key]?.probability) >= CORRIDOR_THRESHOLD)
        .map((corridor) => corridor.id),
      mark: acceptedMark(answers["mark"]?.choice, answers["mark"]?.confidence ?? 0),
    };
  }

  async judge(
    input: AnnouncementScreenInput & { corridors: readonly { id: string; label: string }[] },
  ): Promise<AnnouncementJudgement> {
    const base = await this.screen(input);
    const extra = await this.enrich(input);
    return { ...base, ...extra };
  }

  async chooseMark(text: string): Promise<IncidentMark | null> {
    const started = Date.now();
    const result = await decide({
      model: this.#model,
      state: { text: text.slice(0, 6_000) },
      questions: { mark: markQuestion() },
      retries: { maxAttempts: 2 },
      abortSignal: AbortSignal.timeout(30_000),
    });
    this.#record(result, "screen_mark", started);
    const answer = (result.answers as unknown as Record<string, { choice?: string; confidence?: number }>)[
      "mark"
    ];
    return acceptedMark(answer?.choice, answer?.confidence ?? 0);
  }

  async restoredProbability(text: string): Promise<number> {
    const started = Date.now();
    const result = await decide({
      model: this.#model,
      state: { text: text.slice(0, 6_000) },
      questions: {
        restored: check({
          instructions:
            "Does `text` say that a previously disrupted service on Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, or KRL Jabodetabek is back to normal?",
        }),
      },
      retries: { maxAttempts: 2 },
      abortSignal: AbortSignal.timeout(30_000),
    });
    this.#record(result, "screen_restored", started);
    const answer = (result.answers as unknown as Record<string, { probability?: number }>)["restored"];
    return clamp(answer?.probability);
  }
}

function markQuestion() {
  return choice({
    instructions:
      "Which mark fits `text`? Choose the event itself. Choose unknown when the text does not say which of these it is.",
    options: {
      crash: "A crash or a collision",
      closure: "A road, a stop, or a line is closed",
      diversion: "Service is diverted or the route changes",
      delay: "Service is delayed",
      flood: "Flooding or standing water",
      fire: "A fire",
      maintenance: "Maintenance, construction, or road works",
      weather: "A storm, heavy rain, wind, or other weather",
      crowd: "A crowd, an event, or overcrowding",
      strike: "A strike or a staff stoppage",
      unknown: "The text does not say which of these it is",
    },
  });
}

function isNetworkSystem(value: string | undefined): value is NetworkSystemId {
  return SYSTEMS.some((system) => system === value);
}

function clamp(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
