/**
 * The notice pipeline's evaluation suite.
 *
 * The cases are announcements the monitor actually read, plus a few rail
 * announcements fetched once and committed. A model reads the announcement,
 * the expected answer and what the pipeline produced, and decides whether
 * the pipeline understood it. Nothing here compares strings: an answer that
 * grounds "AEON di Sentul" to Mall Bellanova Sentul is right even though the
 * two spellings differ, and an answer that grounds it to an AEON in East
 * Jakarta is wrong even though the name matches.
 *
 * Run with `pnpm eval:notices`. Add `--case=<id>` to replay one case.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Agent } from "@anvia/core";
import {
  EvalOutcome,
  runEvalSuite,
  type EvalCase,
  type EvalMetric,
} from "@anvia/core/evals";
import { z } from "zod";

import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver, RoadLookup } from "@daily-route/semantic";

import { createClassifierAgent, DisruptionClassifier } from "../classify.js";
import { NetworkCache } from "../context.js";
import { NoticeGrounder } from "../ground.js";
import {
  createCompletionModel,
  MEDIUM_REASONING,
  modelConfigFromEnv,
  type ModelConfig,
} from "../model.js";
import { createAnnouncementScreen } from "../screen.js";
import { flushTracing, langfuseObservability } from "../tracing.js";

type CaseInput = {
  text: string;
  publishedAt: string;
  source: string;
  url: string;
  systemHint: string | null;
};

type CaseExpected = {
  scope: "stop" | "line" | "network" | "not-a-notice";
  places: string[];
  note: string;
};

type PipelineOutput = {
  scope: string;
  isDisruption: boolean;
  title: string;
  stations: string[];
  lines: string[];
  roads: string[];
  note: string;
};

const judgementSchema = z.object({
  scopeCorrect: z.boolean().describe("Apakah scope sama dengan yang diharapkan"),
  placesCorrect: z
    .boolean()
    .describe(
      "Apakah tempat yang disebut sistem adalah tempat yang dimaksud, dan tidak ada tempat yang dikarang atau berada di wilayah lain",
    ),
  inventedPlaces: z
    .array(z.string())
    .describe("Tempat yang disebut sistem tetapi tidak didukung pengumuman atau data; kosong bila tidak ada"),
  verdict: z.enum(["pass", "partial", "fail"]),
  reason: z.string().describe("Satu sampai dua kalimat alasan"),
});

type Judgement = z.infer<typeof judgementSchema>;

const JUDGE_INSTRUCTIONS = `Kamu menilai hasil pembacaan pengumuman gangguan transportasi Jakarta.

Kamu menerima tiga hal:
1. Pengumuman asli.
2. Jawaban yang diharapkan, ditulis manusia, berisi scope dan tempat yang benar serta catatan mengapa.
3. Jawaban sistem: scope, halte, koridor, jalan, dan catatan.

Nilai dengan aturan ini:
- Scope benar bila sistem memilih kategori yang sama dengan jawaban yang diharapkan: stop (halte tertentu), line (koridor/jalur tertentu), network (layanan satu operator tanpa koridor/halte), atau bukan gangguan.
- Tempat benar bila halte/koridor/jalan yang disebut sistem memang yang dimaksud pengumuman. Nama yang mirip tetapi berada di wilayah lain adalah salah. Mengarang id atau nama tempat adalah salah.
- Untuk scope line atau network, daftar halte boleh kosong. Untuk scope stop, halte yang diharapkan harus muncul; halte lain di koridor yang sama boleh ikut.
- Bila pengumuman menyebut jalan, sistem boleh menjawab dengan halte-halte koridor yang berdiri di jalan itu, atau dengan koridor bila haltenya tidak ada di jaringan, asalkan tidak mengarang tempat.
- Abaikan perbedaan ejaan, huruf besar-kecil, dan tanda baca. Nilai maknanya.
- verdict "pass" bila scope dan tempat benar. "partial" bila satu benar dan satu meleset ringan. "fail" bila keduanya salah, atau sistem mengarang tempat.

reason ditulis dalam bahasa Indonesia, singkat.`;

async function loadCases(): Promise<readonly EvalCase<CaseInput, CaseExpected>[]> {
  const path = resolve(import.meta.dirname, "../../../..", "research/eval/notice-cases.json");
  const payload = JSON.parse(await readFile(path, "utf8")) as {
    cases: EvalCase<CaseInput, CaseExpected>[];
  };
  return payload.cases;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const provider = createEmbeddingProvider(env);
  const resolver = new PlaceResolver(db, provider);
  const cache = new NetworkCache({ db, resolver });
  const config = modelConfigFromEnv(env);
  const screen = createAnnouncementScreen(env);
  const roadLookup = new RoadLookup();
  const grounder = new NoticeGrounder({ config, env, resolver, cache, roads: roadLookup });
  const classifier = new DisruptionClassifier(
    createClassifierAgent(config, env),
    resolver,
    cache,
    screen,
    grounder,
  );
  const cases = (await loadCases()).filter((testCase) => !flags.case || testCase.id === flags.case);
  if (cases.length === 0) {
    console.log("No case matches.");
    return;
  }

  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`· ${cases.length} cases, model ${env.AGENT_MODEL}, trace ${runId}`);

  const judge = createJudge(config, env);
  const metric: EvalMetric<CaseInput, PipelineOutput, Judgement, CaseExpected, "grounding"> = {
    name: "grounding",
    required: true,
    dataType: "CATEGORICAL",
    projectScore: (score) => (score.verdict === "pass" ? 1 : score.verdict === "partial" ? 0.5 : 0),
    async evaluate({ case: testCase, output }) {
      const expected = testCase.expected;
      if (!expected) return EvalOutcome.invalid("Case has no expectation.");
      const prompt = [
        "Pengumuman:",
        testCase.input.text.slice(0, 5_000),
        "",
        `Sumber: ${testCase.input.source} · ${testCase.input.publishedAt}`,
        "",
        "Jawaban yang diharapkan:",
        `- scope: ${expected.scope}`,
        `- tempat: ${expected.places.join(", ") || "(boleh kosong)"}`,
        `- catatan: ${expected.note}`,
        "",
        "Jawaban sistem:",
        `- scope: ${output.scope}`,
        `- halte: ${output.stations.join(", ") || "(kosong)"}`,
        `- koridor: ${output.lines.join(", ") || "(kosong)"}`,
        `- jalan: ${output.roads.join(", ") || "(kosong)"}`,
        `- terdeteksi gangguan: ${output.isDisruption ? "ya" : "tidak"}`,
        `- judul: ${output.title || "(kosong)"}`,
        "",
        "Nilai sekarang.",
      ].join("\n");

      const outcome = await judge.generate({
        prompt,
        abortSignal: AbortSignal.timeout(120_000),
        trace: {
          name: "nilai-grounding",
          version: "2026-10-24.1",
          sessionId: runId,
          tags: ["eval", "judge"],
          metadata: { caseId: testCase.id },
        },
      });
      if (outcome.type !== "response") {
        return EvalOutcome.invalid(`The judge did not answer (${outcome.type}).`);
      }
      const verdict = outcome.output;
      return verdict.verdict === "pass"
        ? EvalOutcome.pass(verdict, { comment: verdict.reason })
        : EvalOutcome.fail(verdict, { comment: verdict.reason });
    },
  };

  const { network } = await cache.get();
  const result = await runEvalSuite({
    name: runId,
    cases,
    concurrency: 1,
    target: async (input) => {
      const classified = await classifier.classify({
        text: input.text,
        url: input.url,
        publishedAt: new Date(input.publishedAt),
        source: input.source,
        sourceType: input.source.startsWith("news") ? "news" : "social",
        externalId: `${runId}:${input.url}`,
        systemHint: input.systemHint,
        candidates: [],
        pollId: runId,
      });
      return {
        scope: classified.analysis.isDisruption ? classified.scope : "not-a-notice",
        isDisruption: classified.analysis.isDisruption,
        title: classified.analysis.title,
        stations: classified.stationIds.map((id) => nameOfStation(network, id)),
        lines: classified.lineCodes,
        roads: classified.roads.map((road) => road.name),
        note: classified.analysis.summary,
      } satisfies PipelineOutput;
    },
    metrics: [metric],
    onProgress: (event) => {
      if (event.type === "target-complete") {
        console.log(
          `  ${event.case.id}: target ${event.targetStatus} ${event.durationMs}ms`,
        );
      }
      if (event.type === "metric-complete") {
        console.log(`  ${event.case.id}: ${event.metricName} ${event.outcome.outcome}`);
      }
    },
  });

  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    model: env.AGENT_MODEL,
    jev: screen ? env.JEV_MODEL : null,
    totals: result.cases,
    usage: result.usage,
    cases: result.results.map((caseResult) => ({
      id: caseResult.case.id,
      outcome: caseResult.outcome,
      expected: caseResult.case.expected,
      output: caseResult.output,
      metric: caseResult.metrics.map((entry) => ({
        name: entry.metricName,
        outcome: entry.outcome.outcome,
        score: entry.outcome.score,
        comment: entry.outcome.comment,
      })),
    })),
  };
  const directory = resolve(import.meta.dirname, "../../../..", "research/eval/runs");
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, `${runId}.json`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `· pass ${result.cases.passed}/${result.cases.total} · fail ${result.cases.failed} · invalid ${result.cases.invalid}`,
  );
  console.log(`✓ ${output}`);
  await flushTracing();
}

function createJudge(config: ModelConfig, env: ReturnType<typeof parseEnv>): Agent<Judgement> {
  const observability = langfuseObservability(env);
  return new Agent<Judgement>({
    id: "notice-eval-judge",
    name: "Penilai Grounding Notice",
    description: "Menilai apakah pembacaan pengumuman sesuai dengan jawaban yang diharapkan.",
    model: createCompletionModel(config),
    instructions: JUDGE_INSTRUCTIONS,
    outputSchema: judgementSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

function nameOfStation(network: { stations: readonly { id: string; name: string }[] }, stationId: string): string {
  return network.stations.find((station) => station.id === stationId)?.name ?? stationId;
}

function parseFlags(argv: readonly string[]): { case: string | null } {
  const prefix = "--case=";
  const entry = argv.find((argument) => argument.startsWith(prefix));
  return { case: entry ? entry.slice(prefix.length) : null };
}

main().catch((error: unknown) => {
  console.error("eval gagal:", error);
  process.exitCode = 1;
});
