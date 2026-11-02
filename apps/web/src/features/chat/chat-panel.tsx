import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "../../components/brand/brand-mark.js";
import { NETWORK_SYSTEMS, OperatorBadge } from "../../components/map/operator-mark.js";
import { Button } from "../../components/ui/button.js";
import { Spinner } from "../../components/ui/feedback.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { cn } from "../../lib/cn.js";

import { api } from "../../lib/api.js";

import { useChat, type ChatAction } from "./use-chat.js";
import { ChatCards } from "./chat-cards.js";
import { RichText } from "./rich-text.js";

const PROMPTS = [
  "How do I get from Bundaran HI to Kelapa Gading?",
  "Is any stop closed on this journey?",
  "Tell me about Simpang Kuningan",
  "When is the next service at Grogol Reformasi?",
];

/**
 * The assistant panel.
 *
 * It floats on the map as one sheet. The thread sits above the composer
 * the way a conversation does, and the assistant is marked with the same
 * route glyph as the board, so it reads as a second way into the same
 * network rather than a separate product.
 */
export function ChatPanel({
  onClose,
  onAction,
  origin,
  destination,
  at,
  nightSafe,
}: {
  onClose: () => void;
  onAction: (action: ChatAction) => void;
  origin?: string | undefined;
  destination?: string | undefined;
  at?: string | undefined;
  nightSafe?: boolean | undefined;
}) {
  const { messages, status, error, send } = useChat();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
    retry: false,
  });
  const agentReady = health.data?.agent === true;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Keep the beginning of the latest answer in view. A long answer can
    // contain a route card and two stop cards; scrolling to its very end
    // would hide the route card above the fold.
    const last = element.querySelector<HTMLElement>('[data-message-role="assistant"]:last-of-type');
    const top = last
      ? last.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 8
      : element.scrollHeight;
    element.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [messages]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    await send(text, {
      ...(origin ? { origin } : {}),
      ...(destination ? { destination } : {}),
      ...(at ? { at } : {}),
      ...(nightSafe ? { nightSafe } : {}),
    });
    inputRef.current?.focus();
  };

  return (
    <section className="panel pointer-events-auto flex min-h-0 w-full max-h-[72dvh] flex-col overflow-hidden rounded-[12px] border-t-2 border-t-ink max-lg:h-full max-lg:max-h-none lg:h-[min(520px,calc(100dvh-8rem))] lg:max-h-[calc(100dvh-8rem)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/70 px-3 py-3">
        <BrandMark className="size-7" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-[1.2] text-ink">
            Route assistant
          </h2>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
            <span
              aria-hidden
              className={cn(
                "h-px w-3",
                agentReady === false ? "bg-line-strong" : "bg-accent",
              )}
            />
            {agentReady === false ? "Not connected" : "Same network, same notices"}
          </p>
        </div>
        <Tooltip label="Close assistant">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close assistant"
            onClick={onClose}
            className="size-8"
          >
            <X aria-hidden className="size-4" />
          </Button>
        </Tooltip>
      </header>

      <div
        ref={scrollRef}
        className="scroll-quiet flex min-h-0 flex-auto flex-col overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          agentReady === false ? (
            <p className="px-1 text-[13px] leading-[1.5] text-ink-2">
              The assistant is not connected. Add the model key, then restart the API.
              The planner still calculates journeys.
            </p>
          ) : (
            <div className="flex h-full flex-col">
              <p className="eyebrow">Ask about the city</p>
              <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
                A journey, a fare, a closed stop, or the next service at a stop.
              </p>
              <div className="mt-3 grid gap-1">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      void send(prompt, {
                        ...(origin ? { origin } : {}),
                        ...(destination ? { destination } : {}),
                        ...(at ? { at } : {}),
                        ...(nightSafe ? { nightSafe } : {}),
                      });
                    }}
                    className="press group flex w-full cursor-pointer items-center gap-2 rounded-md border border-line-strong/70 bg-surface px-3 py-2 text-left text-[13px] leading-[1.45] text-ink transition-colors hover:border-ink hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">{prompt}</span>
                    <ArrowUpRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </button>
                ))}
              </div>
              <div className="mt-auto border-t border-line/70 pt-3">
                <p className="eyebrow">Reads the same network</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {NETWORK_SYSTEMS.map((system) => (
                    <OperatorBadge
                      key={system.id}
                      logo={system.logo}
                      className="h-3.5 w-auto max-w-[64px] object-contain object-left opacity-80"
                    />
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-[1.45] text-ink-3">
                  The planner is the source of truth. The assistant explains the
                  board; it does not invent a stop, a fare, or a time.
                </p>
              </div>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => {
              const user = message.role === "user";
              return (
                <li
                  key={message.id}
                  data-message-role={message.role}
                  className={cn("flex flex-col gap-1", user ? "items-end" : "items-start")}
                >
                  <p className="px-1 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.08em] text-ink-3">
                    {user ? "You" : "Daily Route"}
                  </p>
                  <div
                    className={cn(
                      "min-w-0 rounded-lg border px-3 py-2 text-[13px] leading-[1.55] text-ink",
                      user
                        ? "max-w-[92%] border-line-strong/70 bg-surface-2"
                        : "w-full border-line bg-surface",
                    )}
                  >
                    {message.activity && message.text.length === 0 ? (
                      <p className="font-mono text-[12px] leading-[1.2] text-ink-3">
                        {message.activity}
                      </p>
                    ) : null}
                    {message.text ? (
                      <RichText text={message.text} />
                    ) : message.activity ? null : (
                      <Spinner label="Writing the answer…" />
                    )}
                    {message.tools.length > 0 ? (
                      <p className="mt-2 border-t border-line/60 pt-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                        {message.tools.join(" · ")}
                      </p>
                    ) : null}
                    {message.cards.length > 0 ? (
                      <ChatCards
                        cards={message.cards}
                        actions={message.actions}
                        onAction={onAction}
                      />
                    ) : message.actions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.actions.map((action) => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={() => onAction(action)}
                            className="cursor-pointer rounded-[4px] border border-line-strong px-2 py-1 text-left text-[12px] leading-[1.45] text-accent transition-colors hover:bg-surface-2"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? (
        <p className="border-t border-line/70 px-3 py-2 font-mono text-[12px] leading-[1.2] text-danger">
          {error}
        </p>
      ) : null}

      {agentReady === false ? (
        <p className="border-t border-line/70 px-3 py-2 text-[12px] leading-[1.45] text-ink-3">
          You can type a question after the model key is set. The route planner still runs.
        </p>
      ) : (
        <form onSubmit={submit} className="shrink-0 border-t border-line/70 p-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about a journey, a fare, or a stop…"
              aria-label="Message for the route assistant"
              className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              disabled={draft.trim().length === 0 || status === "streaming"}
              aria-label="Send"
              className="size-10 rounded-md"
            >
              {status === "streaming" ? (
                <Spinner className="[&_svg]:text-accent-ink" />
              ) : (
                <Send aria-hidden className="size-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 px-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
            Schedule-based. Not a live arrival.
          </p>
        </form>
      )}
    </section>
  );
}
