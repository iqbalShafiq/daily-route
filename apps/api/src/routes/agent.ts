import { Router } from "express";
import { z } from "zod";

import { readAccountSession } from "../account-session.js";
import { actionsFromTool, parseToolResult } from "../chat-actions.js";
import { cardsFromTool } from "../chat-cards.js";
import type { ApiDeps } from "../deps.js";
import { riderStore } from "../rider-context.js";

/**
 * The conversational endpoint.
 *
 * The browser talks to this route; the model never sees the browser. The
 * response is a Server-Sent Events stream with three event types:
 *
 * - `delta` — a chunk of the answer as the model writes it;
 * - `tool`  — the model called a tool, so the interface can show what the
 *             assistant is doing;
 * - `actions` — buttons built from a tool result;
 * - `done`  — the run finished, with the final text and the token usage.
 */

const chatSchema = z.object({
  message: z.string().min(1).max(4_000),
  /** Places the interface already knows, so the model does not have to ask. */
  origin: z.string().max(200).optional(),
  destination: z.string().max(200).optional(),
  /** Groups one conversation in the trace. */
  sessionId: z.string().min(8).max(80).optional(),
  /** The planner controls the rider already set. */
  at: z.string().datetime({ offset: true }).optional(),
  nightSafe: z.boolean().optional(),
});

const TOOL_STATUS: Record<string, string> = {
  resolve_place: "Looking up a place",
  list_my_places: "Reading your saved places",
  list_my_habits: "Reading your usual journeys",
  plan_journey: "Calculating the journey",
  get_station: "Reading the stop",
  list_active_disruptions: "Checking stored notices",
  search_news: "Reading operator news",
  find_line: "Finding the line",
  list_line_stops: "Listing the line's stops",
  list_line_patterns: "Comparing the line's patterns",
  find_street: "Looking up the street",
  stops_on_street: "Checking the stops on the street",
};

export function createAgentRouter(deps: ApiDeps): Router {
  const router = Router();

  router.post("/chat", async (request, response) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", detail: parsed.error.issues });
      return;
    }

    if (!deps.agent) {
      response.status(503).json({
        error:
          "The model provider is not configured. Set AGENT_API_KEY in .env and restart the API.",
      });
      return;
    }
    // Capture the non-null agent so the closure below keeps the narrowing.
    const agent = deps.agent;

    const { message, origin, destination, sessionId, at, nightSafe } = parsed.data;

    // The chat is usable signed out; an empty id through the store is what
    // tells the rider tools to answer `signedIn: false` instead of guessing.
    const session = await readAccountSession(deps, request, response);
    const userId = session?.userId ?? "";

    const now = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Jakarta",
    }).format(new Date());
    const prompt = [
      message,
      origin && destination
        ? `\n\n[The rider chose] origin: ${origin}, destination: ${destination}. Verify both with a tool before you answer.`
        : "",
      at
        ? `\n\n[The rider chose] departure: ${at}${nightSafe ? " (night-safe: prefer fewer night walks)" : ""}. Pass this as departAt${nightSafe ? " and nightSafe" : ""} to plan_journey.`
        : nightSafe
          ? "\n\n[The rider chose] night-safe: prefer fewer night walks. Pass nightSafe to plan_journey."
          : "",
      `\n\n[Now] ${now} WIB. A notice for a later date is not today's closure.`,
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
      await riderStore.run({ userId }, async () => {
        const stream = agent.stream({
          prompt,
          trace: {
            name: "chat-rute",
            tags: ["chat"],
            ...(sessionId ? { sessionId } : {}),
          },
        });

        let reasoningNoted = false;
        for await (const event of stream.events) {
          if (event.type === "text_delta") {
            send("delta", { text: event.delta });
          } else if (event.type === "reasoning_delta") {
            if (!reasoningNoted) {
              reasoningNoted = true;
              send("status", { text: "Thinking" });
            }
          } else if (event.type === "tool_call") {
            const label = TOOL_STATUS[event.toolCall.toolName] ?? event.toolCall.toolName;
            send("tool", { toolName: event.toolCall.toolName, phase: "start", label });
            send("status", { text: label });
          } else if (event.type === "tool_result") {
            const label = TOOL_STATUS[event.toolName] ?? event.toolName;
            send("tool", {
              toolName: event.toolName,
              phase: "result",
              label: `${label} done`,
            });
            const parsedResult = parseToolResult(event.result);
            const actions = actionsFromTool(event.toolName, parsedResult);
            const cards = cardsFromTool(event.toolName, parsedResult);
            if (cards.length > 0) send("card", { cards });
            if (actions.length > 0) send("actions", { actions });
          }
        }

        const outcome = await stream.result;
        send("done", {
          text: outcome.text,
          usage: outcome.usage,
          finishReason: outcome.finishReason ?? null,
        });
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
