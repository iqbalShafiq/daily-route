import { useCallback, useRef, useState } from "react";

/**
 * The chat transport.
 *
 * The API answers with a Server-Sent Events stream: `delta` for text,
 * `tool` when the assistant calls a tool, and `done` at the end. The
 * browser never talks to the model provider.
 */

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The tools the assistant used while producing this answer. */
  tools: string[];
};

export type ChatStatus = "idle" | "streaming" | "error";

export type ChatState = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  send: (text: string) => Promise<void>;
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

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: "user",
      text: trimmed,
      tools: [],
    };
    const assistantId = nextId();

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", text: "", tools: [] },
    ]);
    setStatus("streaming");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
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

function handleEvent(
  payload: string,
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): void {
  let parsed: { event?: string; data?: unknown };
  try {
    parsed = JSON.parse(payload) as { event?: string; data?: unknown };
  } catch {
    return;
  }

  const event = parsed.event;
  const data = parsed.data as Record<string, unknown> | undefined;

  if (event === "delta") {
    const text = typeof data?.["text"] === "string" ? data["text"] : "";
    if (!text) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId ? { ...message, text: message.text + text } : message,
      ),
    );
    return;
  }

  if (event === "tool") {
    const toolName = typeof data?.["toolName"] === "string" ? data["toolName"] : null;
    if (!toolName) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId && !message.tools.includes(toolName)
          ? { ...message, tools: [...message.tools, toolName] }
          : message,
      ),
    );
    return;
  }

  if (event === "error") {
    const message = typeof data?.["message"] === "string" ? data["message"] : "Terjadi kesalahan";
    setMessages((current) =>
      current.map((entry) =>
        entry.id === assistantId && entry.text.length === 0
          ? { ...entry, text: `Gagal: ${message}` }
          : entry,
      ),
    );
  }
}
