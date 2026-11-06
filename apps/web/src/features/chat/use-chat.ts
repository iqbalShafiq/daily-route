import { useCallback, useRef, useState } from "react";

import type { ChatCard } from "@daily-route/transit";

/**
 * The chat transport.
 *
 * The API answers with a Server-Sent Events stream: `delta` for text,
 * `tool` when the assistant calls a tool, and `done` at the end. The
 * browser never talks to the model provider.
 */

export type ChatAction = {
  key: string;
  label: string;
} & (
  | {
      type: "show_notice";
      disruptionId: string;
      latitude: number;
      longitude: number;
    }
  | { type: "show_route"; origin: string; destination: string }
  | {
      type: "show_stop";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | {
      type: "set_origin";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | {
      type: "set_destination";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | { type: "open_source"; url: string }
);

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The tools the assistant used while producing this answer. */
  tools: string[];
  /** Buttons built from those tools. */
  actions: ChatAction[];
  /** Semantic cards built from a tool result, never from the prose. */
  cards: ChatCard[];
  /** What the assistant is doing before the answer text arrives. */
  activity: string | null;
};

export type ChatStatus = "idle" | "streaming" | "error";

export type ChatContext = {
  origin?: string;
  destination?: string;
  /** The place the rider marked as "here", so the assistant can start there. */
  current?: {
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  };
  at?: string;
};

export type ChatState = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  send: (text: string, context?: ChatContext) => Promise<void>;
  reset: () => void;
};

let counter = 0;

function nextId(): string {
  counter += 1;
  return `message-${counter}`;
}

export function useChat(): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string, context: ChatContext = {}) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: "user",
      text: trimmed,
      tools: [],
      actions: [],
      cards: [],
      activity: null,
    };
    const assistantId = nextId();

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        tools: [],
        actions: [],
        cards: [],
        activity: "Reading the question",
      },
    ]);
    setStatus("streaming");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: chatSessionId(),
          ...(context.origin ? { origin: context.origin } : {}),
          ...(context.destination ? { destination: context.destination } : {}),
          ...(context.current ? { current: context.current } : {}),
          ...(context.at ? { at: context.at } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Permintaan gagal (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          handleEvent(payload, assistantId, setMessages);
        }
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
      return;
    } finally {
      abortRef.current = null;
    }

    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStatus("idle");
  }, []);

  return { messages, status, error, send, reset };
}

const SESSION_KEY = "daily-route.chat-session";

function chatSessionId(): string {
  if (typeof sessionStorage === "undefined") return "server";
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function handleEvent(
  payload: string,
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return;
  }

  const event = parsed["event"];

  if (event === "delta") {
    const text = typeof parsed["text"] === "string" ? parsed["text"] : "";
    if (!text) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, text: message.text + text, activity: null }
          : message,
      ),
    );
    return;
  }

  if (event === "status") {
    const text = typeof parsed["text"] === "string" ? parsed["text"] : "";
    if (!text) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId && message.text.length === 0
          ? { ...message, activity: text }
          : message,
      ),
    );
    return;
  }

  if (event === "tool") {
    const label = typeof parsed["label"] === "string" ? parsed["label"] : null;
    const toolName = typeof parsed["toolName"] === "string" ? parsed["toolName"] : null;
    const phase = parsed["phase"];
    if (phase === "result") return;
    const shown = label ?? toolName;
    if (!shown) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId && !message.tools.includes(shown)
          ? { ...message, tools: [...message.tools, shown], activity: shown }
          : message,
      ),
    );
    return;
  }

  if (event === "card") {
    const cards = readCards(parsed["cards"]);
    if (cards.length === 0) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, cards: mergeCards(message.cards, cards) } : message,
      ),
    );
    return;
  }

  if (event === "actions") {
    const actions = readActions(parsed["actions"]);
    if (actions.length === 0) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, actions: mergeActions(message.actions, actions) }
          : message,
      ),
    );
    return;
  }

  if (event === "done") {
    const text = typeof parsed["text"] === "string" ? parsed["text"] : "";
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? { ...message, text: text.length > 0 ? text : message.text, activity: null }
          : message,
      ),
    );
    return;
  }

  if (event === "error") {
    const message = typeof parsed["message"] === "string" ? parsed["message"] : "Something went wrong";
    setMessages((current) =>
      current.map((entry) =>
        entry.id === assistantId
          ? { ...entry, text: entry.text.length === 0 ? `Failed: ${message}` : entry.text, activity: null }
          : entry,
      ),
    );
  }
}

function mergeCards(current: ChatCard[], next: ChatCard[]): ChatCard[] {
  const merged = [...current];
  for (const card of next) {
    const key = cardKey(card);
    const index = merged.findIndex((entry) => cardKey(entry) === key);
    if (index < 0) {
      merged.push(card);
      continue;
    }
    const existing = merged[index];
    if (existing && existing.type === "stop" && card.type === "stop") {
      merged[index] = {
        ...existing,
        ...card,
        lines: card.lines.length > 0 ? card.lines : existing.lines,
        area: card.area ?? existing.area,
      };
    } else if (existing && existing.type === "route" && card.type === "route") {
      merged[index] = card;
    }
  }
  const priority: Record<ChatCard["type"], number> = { route: 0, notice: 1, stop: 2, source: 3 };
  return merged.sort((a, b) => priority[a.type] - priority[b.type]).slice(0, 6);
}

function cardKey(card: ChatCard): string {
  if (card.type === "route") return `route:${card.origin}>${card.destination}`;
  if (card.type === "stop") return `stop:${card.stationId}`;
  if (card.type === "notice") return `notice:${card.id}`;
  return `source:${card.url}`;
}

function readCards(value: unknown): ChatCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((card): card is ChatCard => {
    if (!card || typeof card !== "object" || Array.isArray(card)) return false;
    const type = (card as Record<string, unknown>)["type"];
    return type === "route" || type === "stop" || type === "notice" || type === "source";
  });
}

function mergeActions(current: ChatAction[], next: ChatAction[]): ChatAction[] {
  const seen = new Set(current.map((action) => action.key));
  const merged = [...current];
  for (const action of next) {
    if (seen.has(action.key)) continue;
    seen.add(action.key);
    merged.push(action);
  }
  return merged.slice(0, 8);
}

function readActions(value: unknown): ChatAction[] {
  if (!Array.isArray(value)) return [];
  const actions: ChatAction[] = [];
  for (const item of value) {
    const action = readAction(item);
    if (action) actions.push(action);
  }
  return actions;
}

function readAction(value: unknown): ChatAction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const key = textOf(row.key);
  const label = textOf(row.label);
  const type = textOf(row.type);
  if (!key || !label || !type) return null;
  if (type === "show_notice") {
    const disruptionId = textOf(row.disruptionId);
    const latitude = numberOf(row.latitude);
    const longitude = numberOf(row.longitude);
    if (!disruptionId || latitude === null || longitude === null) return null;
    return { key, label, type, disruptionId, latitude, longitude };
  }
  if (type === "show_route") {
    const origin = textOf(row.origin);
    const destination = textOf(row.destination);
    if (!origin || !destination) return null;
    return { key, label, type, origin, destination };
  }
  if (type === "show_stop" || type === "set_origin" || type === "set_destination") {
    const stationId = textOf(row.stationId);
    const name = textOf(row.name);
    const latitude = numberOf(row.latitude);
    const longitude = numberOf(row.longitude);
    if (!stationId || !name || latitude === null || longitude === null) return null;
    return { key, label, type, stationId, name, latitude, longitude };
  }
  if (type === "open_source") {
    const url = textOf(row.url);
    if (!url || (!url.startsWith("https://") && !url.startsWith("http://"))) return null;
    return { key, label, type, url };
  }
  return null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
