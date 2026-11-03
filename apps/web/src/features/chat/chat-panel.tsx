import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandMark } from "../../components/brand/brand-mark.js";
import { NETWORK_SYSTEMS, OperatorBadge } from "../../components/map/operator-mark.js";
import { Button } from "../../components/ui/button.js";
import { Spinner } from "../../components/ui/feedback.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { cn } from "../../lib/cn.js";

import { api } from "../../lib/api.js";

import type { MemorySuggestion } from "../route-planner/place-input.js";
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
  places = [],
}: {
  onClose: () => void;
  onAction: (action: ChatAction) => void;
  origin?: string | undefined;
  destination?: string | undefined;
  at?: string | undefined;
  nightSafe?: boolean | undefined;
  /** Saved and recent places, offered when the rider types @. */
  places?: MemorySuggestion[] | undefined;
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
  const [cursor, setCursor] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
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

  const mention = mentionDismissed ? null : mentionQuery(draft, cursor);
  const mentionNeedle = mention?.query ?? "";
  const savedMatches = useMemo(() => {
    if (!mention) return [];
    const needle = mentionNeedle.toLowerCase();
    return places.filter((place) =>
      needle.length === 0
        ? true
        : `${place.name} ${place.detail}`.toLowerCase().includes(needle),
    );
  }, [mention, mentionNeedle, places]);
  const placeSearch = useQuery({
    queryKey: ["places", mentionNeedle],
    queryFn: ({ signal }) => api.places(mentionNeedle, signal),
    enabled: mention !== null && mentionNeedle.length >= 2,
    staleTime: 60_000,
  });
  const mentionRows = useMemo(() => {
    const savedIds = new Set(savedMatches.map((place) => place.place.id));
    const searched = (placeSearch.data ?? [])
      .filter((place) => !savedIds.has(place.id))
      .slice(0, 4)
      .map((place) => ({
        key: place.id,
        title: place.name,
        detail:
          place.kind === "station"
            ? (place.systemName ?? "Stop")
            : (place.detail ?? "Place"),
        insert: place.name,
        overture: place.source === "overture",
        google: place.source === "google",
      }));
    return [
      ...savedMatches.slice(0, 4).map((place) => ({
        key: place.id,
        title: place.detail && place.detail !== "Saved" && place.detail !== "Recent" ? place.detail : place.name,
        detail: place.name,
        insert: place.name,
        overture: false,
        google: false,
      })),
      ...searched,
    ].slice(0, 6);
  }, [savedMatches, placeSearch.data]);

  /*
   * The @ list stays open while the server answers, with a loading line
   * when it has nothing to show yet. A popover that disappears on every
   * keystroke reads as if the place is not in the network.
   */
  const mentionSearching = mentionNeedle.trim().length >= 2;
  const mentionLoading =
    mention !== null &&
    mentionSearching &&
    placeSearch.isPending &&
    placeSearch.fetchStatus === "fetching";
  const mentionFailed = mention !== null && mentionSearching && placeSearch.isError;
  const mentionEmpty =
    mention !== null &&
    mentionSearching &&
    !placeSearch.isPending &&
    !placeSearch.isError &&
    mentionRows.length === 0;
  const mentionOpen =
    mention !== null &&
    (mentionRows.length > 0 || mentionLoading || mentionFailed || mentionEmpty);

  const insertMention = (name: string): void => {
    if (!mention) return;
    const next = `${draft.slice(0, mention.start)}${name}${draft.slice(cursor)}`;
    setDraft(next);
    setCursor(mention.start + name.length);
    setMentionIndex(0);
    inputRef.current?.focus();
  };

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
        <form onSubmit={submit} className="relative shrink-0 border-t border-line/70 p-3">
          {mentionOpen ? (
            <ul
              role="listbox"
              aria-label="Place suggestions"
              className="absolute inset-x-3 bottom-full z-10 mb-2 max-h-48 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-pop"
            >
              {mentionRows.map((row, index) => (
                <li key={row.key} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertMention(row.insert)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col px-3 py-2 text-left",
                      index === mentionIndex ? "bg-surface-2" : "bg-surface",
                    )}
                  >
                    <span className="truncate text-[13px] font-medium text-ink">{row.title}</span>
                    <span className="truncate text-[12px] leading-[1.2] text-ink-3">{row.detail}</span>
                  </button>
                </li>
              ))}
              {mentionLoading && mentionRows.length === 0 ? (
                <li className="px-3 py-3">
                  <Spinner label="Searching places…" />
                </li>
              ) : null}
              {mentionFailed ? (
                <li className="px-3 py-3 text-[12px] leading-[1.45] text-ink-2">
                  Place suggestions could not be loaded. Check the connection and try again.
                </li>
              ) : null}
              {mentionEmpty ? (
                <li className="px-3 py-3 text-[12px] leading-[1.45] text-ink-2">
                  No places match “{mentionNeedle}”.
                </li>
              ) : null}
              {mentionRows.some((row) => row.overture) ? (
                <li className="sticky bottom-0 z-10 border-t border-line/70 bg-surface px-3 py-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                  Places © Overture Maps
                </li>
              ) : null}
              {mentionRows.some((row) => row.google) ? (
                <li className="sticky bottom-0 z-10 border-t border-line/70 bg-surface px-3 py-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                  Powered by Google
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setCursor(event.target.selectionStart ?? event.target.value.length);
                setMentionIndex(0);
                setMentionDismissed(false);
              }}
              onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? draft.length)}
              onKeyDown={(event) => {
                if (!mention || mentionRows.length === 0) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionIndex((index) => {
                    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
                    if (next < 0) return mentionRows.length - 1;
                    return next % mentionRows.length;
                  });
                } else if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const row = mentionRows[mentionIndex];
                  if (row) insertMention(row.insert);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setMentionDismissed(true);
                }
              }}
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

/**
 * The @ token the caret is inside, if the rider is naming a place.
 *
 * The mark has to start a word. An address that happens to contain @ is
 * left alone.
 */
function mentionQuery(value: string, cursor: number): { start: number; query: string } | null {
  if (cursor < 0 || cursor > value.length) return null;
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}
