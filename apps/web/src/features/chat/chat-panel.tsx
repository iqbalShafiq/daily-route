import { useQuery } from "@tanstack/react-query";
import { Bell, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  M3Button,
  M3Chip,
  M3IconButton,
  M3LoadingIndicator,
  M3Shape,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";

import { api } from "../../lib/api.js";

import type { ChosenPlace } from "../route-planner/place-memory.js";
import type { MemorySuggestion } from "../route-planner/place-input.js";
import { useChat, type ChatAction } from "./use-chat.js";
import { ChatCards } from "./chat-cards.js";
import { RichText } from "./rich-text.js";

const PROMPTS = [
  "Rute Bundaran HI ke Kelapa Gading?",
  "Apakah ada halte tutup di rute ini?",
  "Info Stasiun Manggarai",
  "Jadwal berikut di Grogol?",
];

/**
 * Tanya Daily.
 *
 * The assistant floats on the map as one sheet. The thread sits above the
 * composer the way a conversation does, and every card comes from a tool
 * result, never from the prose. The header names the same network the
 * planner reads.
 */
export function ChatPanel({
  onClose,
  onAction,
  onOpenInbox,
  unreadCount,
  onOpenNotice,
  initialPrompt = null,
  onInitialPromptConsumed,
  origin,
  destination,
  at,
  places = [],
  currentPlace = null,
}: {
  onClose: () => void;
  onAction: (action: ChatAction) => void;
  onOpenInbox: () => void;
  unreadCount: number;
  onOpenNotice?: ((noticeId: string) => void) | undefined;
  /** A question from another screen, sent once when the panel opens. */
  initialPrompt?: string | null;
  onInitialPromptConsumed?: (() => void) | undefined;
  origin?: string | undefined;
  destination?: string | undefined;
  at?: string | undefined;
  /** Saved and recent places, offered when the rider types @. */
  places?: MemorySuggestion[] | undefined;
  /** The place the rider marked as "here", from the browser's position. */
  currentPlace?: ChosenPlace | null | undefined;
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
  const consumedPrompt = useRef<string | null>(null);

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
        detail: place.kind === "station" ? (place.systemName ?? "Halte") : (place.detail ?? "Tempat"),
        insert: place.name,
        overture: place.source === "overture",
        google: place.source === "google",
      }));
    return [
      ...savedMatches.slice(0, 4).map((place) => ({
        key: place.id,
        title:
          place.detail && place.detail !== "Saved" && place.detail !== "Recent"
            ? place.detail
            : place.name,
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

  const currentContext = currentPlace
    ? {
        current: {
          name: currentPlace.name,
          address: currentPlace.address ?? null,
          latitude: currentPlace.latitude,
          longitude: currentPlace.longitude,
        },
      }
    : {};

  const context = {
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...currentContext,
    ...(at ? { at } : {}),
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    await send(text, context);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!initialPrompt) {
      consumedPrompt.current = null;
      return;
    }
    if (initialPrompt.trim().length === 0) return;
    if (consumedPrompt.current === initialPrompt) return;
    consumedPrompt.current = initialPrompt;
    void send(initialPrompt, context);
    onInitialPromptConsumed?.();
    // The guard above makes this one send per prompt, even when a context
    // value changes while the answer is streaming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <section className="m3-tab-panel">
      <header className="flex shrink-0 items-center gap-3 border-b border-m3-outline-variant px-4 py-3">
        <M3Shape
          shape="clover4"
          size={44}
          className="m3-breathe shrink-0 bg-m3-primary text-m3-on-primary"
        >
          <MessageSquare aria-hidden className="size-5" />
        </M3Shape>
        <div className="min-w-0 flex-1">
          <h2 className="m3-tm truncate text-m3-on-surface">Tanya Daily</h2>
          <p className="m3-bs mt-0.5 text-m3-on-surface-variant">
            {agentReady === false
              ? "Belum tersambung"
              : "Jaringan dan gangguan yang sama"}
          </p>
        </div>
        <span className="m3-inbox-button">
          <M3IconButton
            label={
              unreadCount > 0 ? `Kotak masuk, ${unreadCount} belum dibaca` : "Kotak masuk"
            }
            variant="tonal"
            onClick={onOpenInbox}
          >
            <Bell aria-hidden />
          </M3IconButton>
          {unreadCount > 0 ? (
            <span className="m3-inbox-button__badge" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        <M3IconButton label="Tutup Tanya Daily" onClick={onClose}>
          <X aria-hidden />
        </M3IconButton>
      </header>

      <div ref={scrollRef} className="m3-chat-thread">
        {messages.length === 0 ? (
          agentReady === false ? (
            <p className="m3-bm text-m3-on-surface-variant">
              Tanya Daily belum tersambung ke model. Perencana rute tetap menghitung
              perjalanan, tarif, dan gangguan dari jaringan.
            </p>
          ) : (
            <div className="grid gap-4">
              <p className="m3-bm text-m3-on-surface-variant">
                Tanya soal perjalanan, tarif, halte yang tutup, atau jadwal berikut.
                Jawaban alat diambil dari jaringan yang sama dengan peta.
              </p>
              <div className="flex flex-wrap gap-2">
                {PROMPTS.map((prompt) => (
                  <M3Chip
                    key={prompt}
                    variant="suggestion"
                    className="justify-start"
                    onClick={() => {
                      void send(prompt, context);
                    }}
                  >
                    {prompt}
                  </M3Chip>
                ))}
              </div>
              <M3Button
                variant="tonal"
                size="s"
                icon={<MessageSquare aria-hidden />}
                onClick={() => inputRef.current?.focus()}
              >
                Tulis pertanyaan
              </M3Button>
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
                  className={cn(
                    "flex flex-col gap-1",
                    user ? "items-end" : "items-start",
                  )}
                >
                  <p className="m3-bs px-1 text-m3-on-surface-variant">
                    {user ? "Kamu" : "Tanya Daily"}
                  </p>
                  <div
                    className={cn(
                      "min-w-0",
                      user ? "m3-chat-bubble--user" : "m3-chat-bubble--assistant",
                    )}
                  >
                    {message.text ? (
                      <div className="m3-bm">
                        <RichText text={message.text} />
                      </div>
                    ) : message.activity ? (
                      <div className="flex items-center gap-2">
                        <M3LoadingIndicator
                          variant="contained"
                          size="sm"
                          label="Menulis jawaban"
                        />
                        <p className="m3-bs text-m3-on-surface-variant">{message.activity}</p>
                      </div>
                    ) : (
                      <M3LoadingIndicator
                        variant="contained"
                        size="sm"
                        label="Menulis jawaban"
                      />
                    )}

                    {message.tools.length > 0 ? (
                      <p className="m3-bs mt-2 inline-flex max-w-full items-center gap-1 rounded-m3-full bg-m3-surface-high px-2 py-1 text-m3-on-surface-variant">
                        <span className="min-w-0 truncate">{message.tools.join(" · ")}</span>
                      </p>
                    ) : null}

                    {message.cards.length > 0 ? (
                      <ChatCards
                        cards={message.cards}
                        actions={message.actions}
                        onAction={onAction}
                        {...(onOpenNotice ? { onOpenNotice } : {})}
                      />
                    ) : message.actions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.actions.map((action) => (
                          <M3Button
                            key={action.key}
                            size="xs"
                            variant="tonal"
                            onClick={() => onAction(action)}
                          >
                            {action.label}
                          </M3Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {status === "streaming" ? (
          <p className="m3-bs text-m3-on-surface-variant">Menunggu jawaban...</p>
        ) : null}
      </div>

      {error ? (
        <p className="m3-bs px-4 py-2 text-m3-error" role="alert">
          {error}
        </p>
      ) : null}

      {agentReady === false ? (
        <p className="border-t border-m3-outline-variant px-4 py-2 text-[12px] leading-[1.45] text-m3-on-surface-variant">
          Tulis pertanyaan setelah kunci model dipasang. Perencana rute tetap berjalan.
        </p>
      ) : (
        <form onSubmit={submit} className="relative shrink-0 p-3">
          {mentionOpen ? (
            <ul
              role="listbox"
              aria-label="Saran tempat"
              className="absolute inset-x-3 bottom-full z-10 mb-2 max-h-48 overflow-y-auto rounded-m3-xl border border-m3-outline-variant bg-m3-surface-lowest shadow-pop"
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
                      index === mentionIndex
                        ? "bg-m3-surface-high"
                        : "bg-m3-surface-lowest",
                    )}
                  >
                    <span className="truncate text-[13px] font-medium text-m3-on-surface">
                      {row.title}
                    </span>
                    <span className="truncate text-[12px] leading-[1.35] text-m3-on-surface-variant">
                      {row.detail}
                    </span>
                  </button>
                </li>
              ))}
              {mentionLoading && mentionRows.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-3">
                  <M3LoadingIndicator size="sm" label="Mencari tempat" />
                  <span className="m3-bs text-m3-on-surface-variant">Mencari tempat...</span>
                </li>
              ) : null}
              {mentionFailed ? (
                <li className="px-3 py-3 text-[12px] leading-[1.45] text-m3-on-surface-variant">
                  Saran tempat tidak bisa dibaca. Periksa koneksi lalu coba lagi.
                </li>
              ) : null}
              {mentionEmpty ? (
                <li className="px-3 py-3 text-[12px] leading-[1.45] text-m3-on-surface-variant">
                  Tidak ada tempat yang cocok dengan “{mentionNeedle}”.
                </li>
              ) : null}
              {mentionRows.some((row) => row.overture) ? (
                <li className="sticky bottom-0 z-10 border-t border-m3-outline-variant bg-m3-surface-lowest px-3 py-2 text-[12px] leading-[1.35] text-m3-on-surface-variant">
                  Tempat © Overture Maps
                </li>
              ) : null}
              {mentionRows.some((row) => row.google) ? (
                <li className="sticky bottom-0 z-10 border-t border-m3-outline-variant bg-m3-surface-lowest px-3 py-2 text-[12px] leading-[1.35] text-m3-on-surface-variant">
                  Powered by Google
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="m3-chat-composer">
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
              placeholder="Tanya rute, tarif, atau halte..."
              aria-label="Pesan untuk Tanya Daily"
            />
            <M3IconButton
              type="submit"
              label="Kirim pesan"
              variant="filled"
              size="m"
              disabled={draft.trim().length === 0 || status === "streaming"}
            >
              {status === "streaming" ? (
                <M3LoadingIndicator size="sm" label="Mengirim" />
              ) : (
                <Send aria-hidden />
              )}
            </M3IconButton>
          </div>
          <p className="m3-bs mt-2 px-1 text-m3-on-surface-variant">
            Berdasarkan jadwal, bukan kedatangan live.
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
