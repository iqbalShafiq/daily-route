import { useQuery } from "@tanstack/react-query";
import { AlertCircle, MapPin, Star, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, type MatchedRange, type PlaceSuggestion } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { Input } from "../../components/ui/input.js";
import { Spinner } from "../../components/ui/feedback.js";

import type { ChosenPlace } from "./place-memory.js";

/**
 * The place field.
 *
 * It accepts free text — a station name, a district, a landmark — and
 * offers the stations and the places that match. The suggestions come
 * from the server. A landmark is not rewritten into the nearest halte:
 * the reader keeps the name they chose, and the walk is part of the route.
 *
 * When the field is empty the list is the places this browser has saved
 * and the places it has used. The focus stays in the input, and the
 * active option is pointed at with `aria-activedescendant`.
 */

/** How long to wait after the last keystroke before asking the server. */
const DEBOUNCE_MS = 250;

/** Below this many characters there is nothing worth suggesting. */
const MINIMUM_QUERY_LENGTH = 2;

/** How many suggestions are offered. */
const MAXIMUM_RESULTS = 8;

/** How many options the page keys move at once. */
const PAGE_SIZE = 5;

export type MemorySuggestion = {
  id: string;
  name: string;
  detail: string;
  place: ChosenPlace;
};

type Row = {
  key: string;
  name: string;
  detail: string;
  ranges: MatchedRange[];
  interchange: boolean;
  place: ChosenPlace;
  source?: "google" | "openstreetmap" | "overture" | undefined;
};

export function PlaceInput({
  label,
  value,
  onValueChange,
  onSelectPlace,
  placeholder,
  icon,
  invalid,
  autoFocus,
  trailingAction,
  variant,
  memory = [],
  canSave = false,
  saved = false,
  onToggleSaved,
  floating = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelectPlace?: ((place: ChosenPlace) => void) | undefined;
  placeholder: string;
  icon?: React.ReactNode | undefined;
  invalid?: boolean | undefined;
  autoFocus?: boolean | undefined;
  /** A control at the end of the field, such as "use my position". */
  trailingAction?: React.ReactNode | undefined;
  /** `row` makes the field one line of a larger surface. */
  variant?: "field" | "row" | undefined;
  /** Saved and recent places, shown when the field is empty. */
  memory?: MemorySuggestion[] | undefined;
  /** Whether the current text is a place that can be saved. */
  canSave?: boolean | undefined;
  saved?: boolean | undefined;
  onToggleSaved?: (() => void) | undefined;
  /**
   * Put the list in a portal and follow the field with `position: fixed`.
   * A sheet that scrolls or clips its content would otherwise cut the
   * list off at its own edge.
   */
  floating?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  // -1 means the list is open but nothing is selected yet.
  const [highlight, setHighlight] = useState(0);
  const [anchor, setAnchor] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const optionId = (index: number): string => `${listId}-option-${index}`;

  const query = value.trim();
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const searching = debouncedQuery.length >= MINIMUM_QUERY_LENGTH;

  // The request waits for the typing to pause, and the previous results
  // stay on screen while the new ones are fetched, so the list never
  // flickers and never reorders under the pointer. A request that is
  // still running when the query changes is cancelled.
  const suggestions = useQuery({
    queryKey: ["places", debouncedQuery],
    queryFn: ({ signal }) => api.places(debouncedQuery, signal),
    enabled: searching,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  const searched = useMemo(
    () => (suggestions.data ?? []).slice(0, MAXIMUM_RESULTS).map(rowOfSuggestion),
    [suggestions.data],
  );
  const remembered = useMemo(() => memory.map(rowOfMemory), [memory]);
  const showingMemory = query.length < MINIMUM_QUERY_LENGTH;
  // A typed query still offers saved places, matched by the rider's label
  // or by the place name, ahead of the stops and landmarks from the server.
  const rememberedMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < MINIMUM_QUERY_LENGTH) return [];
    return memory
      .filter((item) =>
        `${item.name} ${item.detail}`.toLowerCase().includes(needle),
      )
      .map(rowOfMemory);
  }, [memory, query]);
  const rows = showingMemory
    ? remembered
    : [
        ...rememberedMatches,
        ...searched.filter(
          (row) => !rememberedMatches.some((saved) => saved.place.id === row.place.id),
        ),
      ].slice(0, MAXIMUM_RESULTS);

  // The list closes when the pointer goes somewhere else.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /*
   * A floating list follows the field. It is placed below the field when
   * there is room, and above it when the field sits near the bottom of
   * the window. On a phone the list is the bottom sheet of the field,
   * which is already fixed, so no coordinates are needed.
   */
  useLayoutEffect(() => {
    if (!open || !floating) return;

    const update = (): void => {
      const element = containerRef.current;
      if (!element) return;
      if (window.matchMedia("(max-width: 767px)").matches) {
        setAnchor(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const placeAbove = below < 240 && above > below;
      setAnchor({
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        ...(placeAbove
          ? { bottom: Math.round(window.innerHeight - rect.top + 8) }
          : { top: Math.round(rect.bottom + 8) }),
        maxHeight: Math.max(160, Math.min(288, placeAbove ? above : below)),
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, floating, rows.length]);

  // The active result follows the keyboard.
  useEffect(() => {
    if (!open || highlight < 0) return;
    const option = listRef.current?.children[highlight];
    if (option instanceof HTMLElement) {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open, rows]);

  const showList = open && (searching || (showingMemory && rows.length > 0));
  const showEmpty = showList && searching && !suggestions.isPending && rows.length === 0;
  const showError = showList && searching && suggestions.isError;
  const loading = searching && suggestions.isPending && suggestions.fetchStatus === "fetching";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (rows.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => {
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        // Up from the first option returns to the input itself.
        if (next < 0) return -1;
        return next % rows.length;
      });
      return;
    }

    if (event.key === "PageDown" || event.key === "PageUp") {
      if (rows.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => {
        const next = event.key === "PageDown" ? index + PAGE_SIZE : index - PAGE_SIZE;
        if (next < 0) return -1;
        return Math.min(next, rows.length - 1);
      });
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!showList || rows.length === 0) return;
      event.preventDefault();
      setHighlight(event.key === "Home" ? 0 : rows.length - 1);
      return;
    }

    if (event.key === "Enter") {
      if (!showList || highlight < 0) return;
      const suggestion = rows[highlight];
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

  const choose = (row: Row): void => {
    onValueChange(row.name);
    onSelectPlace?.(row.place);
    setOpen(false);
    // The focus stays in the field, with the caret at the end of the name.
    inputRef.current?.focus();
  };

  /*
   * The controls at the end of the field.
   *
   * The order is fixed: what removes the text comes first, what acts on
   * it comes last. The button that runs the search is therefore always
   * the rightmost thing in the form, which is where a thumb expects it.
   */
  const trailing = useMemo(
    () => {
      const saveButton = canSave ? (
        <button
          type="button"
          aria-label={saved ? "Remove from saved" : "Save place"}
          title={saved ? "Remove from saved" : "Save place"}
          aria-pressed={saved}
          onClick={onToggleSaved}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Star aria-hidden className={cn("size-3.5", saved && "fill-current text-ink")} />
        </button>
      ) : null;

      const clearButton =
        value.length > 0 ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              onValueChange("");
              setOpen(false);
            }}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null;

      const tools =
        saveButton || clearButton ? (
          <span className="flex items-center gap-1">
            {saveButton}
            {clearButton}
          </span>
        ) : null;

      if (trailingAction) {
        return (
          <span className="flex items-center gap-1">
            {tools}
            {trailingAction}
          </span>
        );
      }
      if (tools) return tools;
      if (loading) return <Spinner />;
      return null;
    },
    [value, onValueChange, loading, trailingAction, canSave, saved, onToggleSaved],
  );

  const list = showList ? (
    <ul
      id={listId}
      ref={listRef}
      role="listbox"
      aria-label={`Places matching ${label}`}
      className={cn(
        "list-in overflow-y-auto overscroll-contain rounded-lg border border-line-strong bg-surface shadow-pop",
        floating
          ? "fixed z-[75] max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[62dvh] max-md:rounded-b-none max-md:rounded-t-[16px] max-md:border-x-0 max-md:border-b-0 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]"
          : [
              // On a phone the list becomes a sheet at the bottom of the
              // screen: the keyboard covers half of it, and a dropdown
              // under the field would be covered with it.
              "absolute inset-x-0 top-full z-50 mt-2 max-h-72",
              "max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:mt-0",
              "max-md:max-h-[62dvh] max-md:rounded-b-none max-md:rounded-t-[16px] max-md:border-x-0 max-md:border-b-0 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]",
            ],
      )}
      style={floating ? (anchor ?? undefined) : undefined}
    >
      <li role="presentation" className="sticky top-0 z-10 bg-surface px-3 pb-1 pt-2 md:hidden">
        <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-line-strong/70" />
      </li>

      {loading && rows.length === 0 ? (
        <li className="flex items-center justify-center px-3 py-5">
          <Spinner label="Searching places…" />
        </li>
      ) : null}

      {showError ? (
        <li className="flex items-center gap-2 px-3 py-4 text-[13px] leading-[1.5] text-ink-2">
          <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
          Place suggestions could not be loaded. Check the connection and try again.
        </li>
      ) : null}

      {showEmpty ? (
        <li className="px-3 py-5 text-[13px] leading-[1.5] text-ink-2">
          No places match “{query}”.
        </li>
      ) : null}

      {rows.map((suggestion, index) => {
        return (
          <li
            key={suggestion.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === highlight}
            className={cn(
              "border-l-2 transition-colors",
              index === highlight
                ? "border-l-accent bg-surface-2"
                : "border-l-transparent bg-surface",
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(suggestion)}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface-2 text-ink-3">
                <MapPin aria-hidden className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">
                  <Highlighted text={suggestion.name} ranges={suggestion.ranges} />
                </span>
                {suggestion.detail ? (
                  <span className="mt-0.5 block truncate font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                    {suggestion.detail}
                  </span>
                ) : null}
              </span>
              {suggestion.interchange ? (
                <span className="shrink-0 rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                  Interchange
                </span>
              ) : null}
            </button>
          </li>
        );
      })}

      {rows.some((row) => row.source === "overture") ? (
        <li
          role="presentation"
          className="sticky bottom-0 z-10 border-t border-line/70 bg-surface px-3 py-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3"
        >
          Places © Overture Maps
        </li>
      ) : null}

      {rows.some((row) => row.source === "google") ? (
        <li
          role="presentation"
          className="sticky bottom-0 z-10 border-t border-line/70 bg-surface px-3 py-2 font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3"
        >
          Powered by Google
        </li>
      ) : null}
    </ul>
  ) : null;

  return (
    // The field fills the line it is in, so the controls at its end
    // stand at the end of the line and not right after the text.
    <div ref={containerRef} className="relative flex min-w-0 flex-1">
      <Input
        ref={inputRef}
        variant={variant}
        label={label}
        value={value}
        placeholder={placeholder}
        icon={icon}
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
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {floating && list ? createPortal(list, document.body) : list}

      {/* The number of results, for a reader that does not see the list. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showList && rows.length > 0 ? `${rows.length} suggestions available` : ""}
        {showEmpty ? `No places match “${query}”` : ""}
      </span>
    </div>
  );
}

function rowOfSuggestion(suggestion: PlaceSuggestion): Row {
  const detail =
    suggestion.kind === "place"
      ? [suggestion.detail ?? "Place", suggestion.street]
          .filter((part) => part && part.length > 0)
          .join(" · ")
      : [
          suggestion.systemName,
          suggestion.lineCount
            ? `${suggestion.lineCount} ${suggestion.lineCount === 1 ? "line" : "lines"}`
            : null,
          suggestion.street,
        ]
          .filter((part) => part && part.length > 0)
          .join(" · ");

  return {
    key: suggestion.id,
    name: suggestion.name,
    detail,
    ranges: suggestion.matchedRanges ?? [],
    interchange: suggestion.kind === "station" && suggestion.isInterchange,
    source: suggestion.source,
    place: {
      kind: suggestion.kind,
      id: suggestion.id,
      name: suggestion.name,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      systemId: suggestion.systemId,
      systemName: suggestion.systemName,
    },
  };
}

function rowOfMemory(suggestion: MemorySuggestion): Row {
  return {
    key: suggestion.id,
    name: suggestion.name,
    detail: suggestion.detail,
    ranges: [],
    interchange: false,
    place: suggestion.place,
  };
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
            className="rounded-[3px] bg-accent-soft px-0.5 font-semibold text-ink"
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
