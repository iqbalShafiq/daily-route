import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/button.js";
import { Card, CardHeader } from "../../components/ui/card.js";
import { EmptyState, Spinner } from "../../components/ui/feedback.js";
import { cn } from "../../lib/cn.js";

import { useChat } from "./use-chat.js";

/**
 * The assistant panel.
 *
 * The assistant answers questions about the route with the same data the
 * planner uses, and it can look up the operators' announcements. The tool
 * names it used are shown underneath the answer, so the rider can see what
 * the answer is based on.
 */
export function ChatPanel() {
  const { messages, status, error, send } = useChat();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    await send(text);
    inputRef.current?.focus();
  };

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        title="Tanya asisten rute"
        description="Asisten memakai data jaringan yang sama dan memeriksa pengalihan terbaru."
      />

      <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles aria-hidden className="size-5" />}
            title="Mulai bertanya"
            description="Contoh: “Bagaimana cara dari Bundaran HI ke Kelapa Gading?” atau “Apakah koridor 1 sedang dialihkan?”"
          />
        ) : (
          <ul className="flex flex-col gap-3 py-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                  message.role === "user"
                    ? "self-end bg-accent text-accent-ink"
                    : "self-start border border-line bg-surface-2 text-ink",
                )}
              >
                {message.text ? (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                ) : (
                  <span className="inline-flex items-center gap-2 text-ink-3">
                    <Spinner label="Menyusun jawaban…" />
                  </span>
                )}
                {message.tools.length > 0 ? (
                  <p className="mt-1.5 flex flex-wrap gap-1 border-t border-line/60 pt-1.5 text-[10px] text-ink-3">
                    {message.tools.map((tool) => (
                      <span key={tool} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono">
                        {tool}
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p className="border-t border-line px-4 py-2 text-[12px] text-danger">{error}</p>
      ) : null}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tulis pertanyaan…"
          aria-label="Pesan untuk asisten rute"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled={draft.trim().length === 0 || status === "streaming"}
          aria-label="Kirim"
        >
          {status === "streaming" ? (
            <Spinner className="[&_svg]:text-accent-ink" />
          ) : (
            <Send aria-hidden className="size-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}

