import { MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { api, type StationSummary } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { Input } from "../../components/ui/input.js";

/**
 * The place field.
 *
 * It accepts free text — a station name, a district, a landmark — and
 * offers the stations that match. The suggestions come from the semantic
 * resolver on the server, so a misspelled name still finds its station.
 */
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
  const [suggestions, setSuggestions] = useState<StationSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    const query = value.trim();
    // A query that is too short has no suggestions; the list is cleared by
    // the input handler instead, so no state is set during this effect.
    if (query.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .stations({ q: query, limit: 6 })
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);
          setHighlight(0);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const showSuggestions = open && suggestions.length > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showSuggestions) {
      if (event.key === "ArrowDown" && suggestions.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[highlight];
      if (suggestion) choose(suggestion);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const choose = (station: StationSummary): void => {
    onValueChange(station.name);
    onSelect?.(station);
    setOpen(false);
  };

  const trailing = useMemo(
    () =>
      value.length > 0 ? (
        <button
          type="button"
          aria-label="Bersihkan"
          onClick={() => {
            onValueChange("");
            setSuggestions([]);
            setOpen(false);
          }}
          className="flex size-6 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null,
    [value, onValueChange],
  );

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={label}
        value={value}
        placeholder={placeholder}
        icon={icon ?? <Search aria-hidden className="size-4" />}
        trailing={trailing}
        invalid={invalid}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          onValueChange(event.target.value);
          if (event.target.value.trim().length < 2) setSuggestions([]);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {showSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(suggestion)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  index === highlight ? "bg-surface-2" : "bg-surface",
                )}
              >
                <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{suggestion.name}</span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {suggestion.systemName ?? suggestion.systemId}
                    {suggestion.code ? ` · ${suggestion.code}` : ""}
                  </span>
                </span>
                {suggestion.isInterchange ? (
                  <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-3">
                    Transit
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
