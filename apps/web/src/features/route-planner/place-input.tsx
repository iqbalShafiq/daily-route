import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { api, type MatchedRange, type StationSummary } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { Input } from "../../components/ui/input.js";

/**
 * The place field.
 *
 * It accepts free text — a station name, a district, a landmark — and
 * offers the stations that match. The suggestions come from the semantic
 * resolver on the server, so a misspelled name still finds its station.
 *
 * The list follows the combobox pattern of the ARIA practices: the input
 * keeps the focus, the active option is pointed at with
 * `aria-activedescendant`, and the keyboard moves through the list
 * without ever leaving the field. The rules it follows are written down
 * in `research/ux-search.md`.
 */

/** How long to wait after the last keystroke before asking the server. */
const DEBOUNCE_MS = 250;

/** Below this many characters there is nothing worth suggesting. */
const MINIMUM_QUERY_LENGTH = 2;

/** How many suggestions are offered. */
const MAXIMUM_RESULTS = 6;

/**
 * The score above which a match is strong enough to plan a route to.
 *
 * Below it the suggestion is still shown, but it is marked as uncertain.
 */
const CONFIDENT_SCORE = 0.3;

/** How many options the page keys move at once. */
const PAGE_SIZE = 5;

export function PlaceInput({
  label,
  value,
  onValueChange,
  onSelect,
  placeholder,
  icon,
  invalid,
  autoFocus,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect?: ((station: StationSummary) => void) | undefined;
  placeholder?: string | undefined;
  icon?: React.ReactNode | undefined;
  invalid?: boolean | undefined;
  autoFocus?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  // -1 means the list is open but nothing is selected yet.
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const optionId = (index: number): string => `${listId}-option-${index}`;

  const query = value.trim();
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  // The request waits for the typing to pause, and the previous results
  // stay on screen while the new ones are fetched, so the list never
  // flickers and never reorders under the pointer. A request that is
  // still running when the query changes is cancelled.
  const suggestions = useQuery({
    queryKey: ["stations", debouncedQuery],
    queryFn: ({ signal }) => api.stations({ q: debouncedQuery, limit: MAXIMUM_RESULTS }, signal),
    enabled: debouncedQuery.length >= MINIMUM_QUERY_LENGTH,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  const results = useMemo(() => suggestions.data ?? [], [suggestions.data]);

  // The list closes when the pointer goes somewhere else.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // The active result follows the keyboard.
  useEffect(() => {
    if (!open || highlight < 0) return;
    const option = listRef.current?.children[highlight];
    if (option instanceof HTMLElement) {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open, results]);

  const showList = open && query.length >= MINIMUM_QUERY_LENGTH;
  const showEmpty = showList && !suggestions.isPending && results.length === 0;
  const showError = showList && suggestions.isError;
  const loading = suggestions.isPending && suggestions.fetchStatus === "fetching";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => {
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        // Up from the first option returns to the input itself.
        if (next < 0) return -1;
        return next % results.length;
      });
      return;
    }

    if (event.key === "PageDown" || event.key === "PageUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => {
        const next = event.key === "PageDown" ? index + PAGE_SIZE : index - PAGE_SIZE;
        if (next < 0) return -1;
        return Math.min(next, results.length - 1);
      });
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!showList || results.length === 0) return;
      event.preventDefault();
      setHighlight(event.key === "Home" ? 0 : results.length - 1);
      return;
    }

    if (event.key === "Enter") {
      if (!showList || highlight < 0) return;
      const suggestion = results[highlight];
      if (!suggestion) return;
      event.preventDefault();
      choose(suggestion);
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      // The list is already closed: the field is emptied.
      onValueChange("");
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const choose = (station: StationSummary): void => {
    onValueChange(station.name);
    onSelect?.(station);
    setOpen(false);
    // The focus stays in the field, with the caret at the end of the name.
    inputRef.current?.focus();
  };

  const trailing = useMemo(
    () =>
      value.length > 0 ? (
        <button
          type="button"
          aria-label="Bersihkan"
          onClick={() => {
            onValueChange("");
            setOpen(false);
          }}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : loading ? (
        <Loader2 aria-hidden className="size-3.5 animate-spin text-ink-3" />
      ) : null,
    [value, onValueChange, loading],
  );

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        label={label}
        value={value}
        placeholder={placeholder}
        icon={icon ?? <Search aria-hidden className="size-4" />}
        trailing={trailing}
        invalid={invalid}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && highlight >= 0 ? optionId(highlight) : undefined
        }
        onChange={(event) => {
          onValueChange(event.target.value);
          // A new query starts at the first result again.
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {showList ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={`Saran tempat untuk ${label}`}
          className={cn(
            // On a phone the list becomes a sheet at the bottom of the
            // screen: the keyboard covers half of it, and a dropdown
            // under the field would be covered with it.
            "absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto overscroll-contain",
            "rounded-xl border border-line bg-surface shadow-pop",
            "max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:mt-0",
            "max-md:max-h-[60dvh] max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0",
          )}
        >
          {loading && results.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-3 text-[13px] text-ink-3">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              Mencari tempat…
            </li>
          ) : null}

          {showError ? (
            <li className="flex items-center gap-2 px-3 py-3 text-[13px] text-ink-3">
              <AlertCircle aria-hidden className="size-3.5 shrink-0" />
              Saran gagal dimuat. Periksa koneksi lalu coba lagi.
            </li>
          ) : null}

          {showEmpty ? (
            <li className="px-3 py-3 text-[13px] text-ink-3">
              Tidak ada tempat yang cocok dengan “{query}”.
            </li>
          ) : null}

          {results.map((suggestion, index) => {
            const confident = (suggestion.score ?? 0) >= CONFIDENT_SCORE;
            return (
              <li
                key={suggestion.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlight}
                className={cn(index === highlight ? "bg-surface-2" : "bg-surface")}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(suggestion)}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                >
                  <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[14px]",
                        confident ? "font-semibold text-ink" : "text-ink-2",
                      )}
                    >
                      <Highlighted
                        text={suggestion.name}
                        ranges={suggestion.matchedRanges ?? []}
                      />
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      <span>{suggestion.systemName ?? suggestion.systemId}</span>
                      {suggestion.lineCount ? (
                        <span>· {suggestion.lineCount} garis</span>
                      ) : null}
                      {!confident ? (
                        <span className="rounded bg-surface-3 px-1.5 py-px text-[10px]">
                          kurang yakin
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {suggestion.isInterchange ? (
                    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-3">
                      Transit
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* The number of results, for a reader that does not see the list. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showList && results.length > 0 ? `${results.length} saran tersedia` : ""}
        {showEmpty ? `Tidak ada saran untuk “${query}”` : ""}
      </span>
    </div>
  );
}

/**
 * The part of a name that matched what was typed.
 *
 * The ranges come from the server, which only reports a match it can
 * point at. The mark is a `<mark>`, so a reader hears the same
 * distinction the eye makes.
 */
function Highlighted({ text, ranges }: { text: string; ranges: readonly MatchedRange[] }) {
  const parts = useMemo(() => splitByRanges(text, ranges), [text, ranges]);

  return (
    <>
      {parts.map((part, index) =>
        part.matched ? (
          <mark
            key={index}
            className="bg-transparent font-semibold text-ink underline decoration-accent decoration-2 underline-offset-2"
          >
            {part.value}
          </mark>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}

/** Split a name into the ranges that matched and the parts that did not. */
function splitByRanges(
  text: string,
  ranges: readonly MatchedRange[],
): { value: string; matched: boolean }[] {
  if (ranges.length === 0) return [{ value: text, matched: false }];

  const parts: { value: string; matched: boolean }[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start < cursor || range.start >= range.end) continue;
    if (range.start > cursor) parts.push({ value: text.slice(cursor, range.start), matched: false });
    parts.push({ value: text.slice(range.start, range.end), matched: true });
    cursor = range.end;
  }

  if (cursor < text.length) parts.push({ value: text.slice(cursor), matched: false });
  return parts;
}

/**
 * A value that settles after the typing pauses.
 *
 * The suggestion list asks the server once the reader stops typing, not
 * once per letter.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
