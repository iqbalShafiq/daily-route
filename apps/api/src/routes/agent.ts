import { Router } from "express";
import { z } from "zod";

import type { ApiDeps } from "../deps.js";

/**
 * The conversational endpoint.
 *
 * The browser talks to this route; the model never sees the browser. The
 * response is a Server-Sent Events stream with three event types:
 *
 * - `delta` — a chunk of the answer as the model writes it;
 * - `tool`  — the model called a tool, so the interface can show what the
 *             assistant is doing;
 * - `done`  — the run finished, with the final text and the token usage.
 */

const chatSchema = z.object({
  message: z.string().min(1).max(4_000),
  /** Places the interface already knows, so the model does not have to ask. */
  origin: z.string().max(200).optional(),
  destination: z.string().max(200).optional(),
});

export function createAgentRouter(deps: ApiDeps): Router {
  const router = Router();

  router.post("/chat", async (request, response) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Permintaan tidak valid", detail: parsed.error.issues });
      return;
    }

    if (!deps.agent) {
      response.status(503).json({
        error:
          "Model provider belum dikonfigurasi. Isi AGENT_API_KEY di .env lalu jalankan ulang API.",
      });
      return;
    }

    const { message, origin, destination } = parsed.data;

    const prompt = [
      message,
      origin && destination
        ? `\n\n[Pilihan pengguna] asal: ${origin}, tujuan: ${destination}. Tetap verifikasi lewat tool sebelum menjawab.`
        : "",
    ]
      .filter((part) => part !== "")
      .join("");

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: unknown): void => {
      // The event name is repeated inside the payload so a client that only
      // reads `data:` lines can still tell the frames apart.
      response.write(
        `event: ${event}\ndata: ${JSON.stringify({ event, ...(data as Record<string, unknown>) })}\n\n`,
      );
    };

    try {
      const stream = deps.agent.stream({ prompt });

      for await (const event of stream.events) {
        if (event.type === "text_delta") {
          send("delta", { text: event.delta });
        } else if (event.type === "agent_tool_event") {
          send("tool", {
            toolName: event.toolName,
            phase: event.event.type,
          });
        }
      }

      const outcome = await stream.result;
      send("done", {
        text: outcome.text,
        usage: outcome.usage,
        finishReason: outcome.finishReason ?? null,
      });
    } catch (error) {
      send("error", { message: error instanceof Error ? error.message : String(error) });
    } finally {
      response.end();
    }
  });

  router.get("/tools", (_request, response) => {
    response.json({
      configured: deps.agent !== null,
      model: deps.env.AGENT_MODEL,
      provider: new URL(deps.env.AGENT_BASE_URL).host,
    });
  });

  return router;
}
