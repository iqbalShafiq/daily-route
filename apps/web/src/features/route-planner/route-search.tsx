import { useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  CalendarClock,
  Clock3,
  LocateFixed,
  TriangleAlert,
} from "lucide-react";

import { BrandLockup } from "../../components/brand/brand-mark.js";
import { Button } from "../../components/ui/button.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import { cn } from "../../lib/cn.js";

import { PlaceInput, type MemorySuggestion } from "./place-input.js";
import { TimePicker } from "./time-picker.js";

/**
 * The search surface.
 *
 * It is one object over the map: the brand plate, two place rows joined
 * by a route line, the swap key on that line, and the departure controls.
 * The button that runs the search sits at the end of the second row, where
 * a thumb expects it.
 *
 * On a phone the surface is the full width of the window. On a wide
 * screen it floats in the corner, because there the map is the wider
 * thing.
 */
export function RouteSearch({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSubmit,
  onSwap,
  onUseMyPosition,
  locating = false,
  onSelectOrigin,
  onSelectDestination,
  onToggleSavedOrigin,
  onToggleSavedDestination,
  originCanSave = false,
  destinationCanSave = false,
  originSaved,
  destinationSaved,
  memory,
  notice,
  walkError,
  departureMode = "now",
  departureTime = "",
  onDepartureModeChange,
  onDepartureTimeChange,
  className,
}: {
  origin: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  onSwap: () => void;
  /** Ask the browser where the reader is, and plan from there. */
  onUseMyPosition?: (() => void) | undefined;
  /** The browser is reading the position and the address. */
  locating?: boolean | undefined;
  onSelectOrigin?: ((place: MemorySuggestion["place"]) => void) | undefined;
  onSelectDestination?: ((place: MemorySuggestion["place"]) => void) | undefined;
  onToggleSavedOrigin?: (() => void) | undefined;
  onToggleSavedDestination?: (() => void) | undefined;
  originCanSave?: boolean | undefined;
  destinationCanSave?: boolean | undefined;
  originSaved?: boolean | undefined;
  destinationSaved?: boolean | undefined;
  /** Saved places, then recent ones, for an empty field. */
  memory?: MemorySuggestion[] | undefined;
  /** A closure the rider should see before asking for a route. */
  notice?: { title: string; demonstration: boolean } | null | undefined;
  /** Why the walk could not be planned, when it could not. */
  walkError?: string | null | undefined;
  /** Whether the rider leaves now or at a chosen time. */
  departureMode?: "now" | "at" | undefined;
  departureTime?: string | undefined;
  onDepartureModeChange?: ((mode: "now" | "at") => void) | undefined;
  onDepartureTimeChange?: ((time: string) => void) | undefined;
  className?: string;
}) {
  const canSearch = destination.trim().length > 0;
  const [timePickerSignal, setTimePickerSignal] = useState(0);
  const [swapAngle, setSwapAngle] = useState(0);

  return (
    <div className={cn("relative z-30 flex flex-col gap-2", className)}>
      <div
        role="search"
        aria-label="Route search"
        className={cn(
          "relative border-b border-line-strong bg-surface pt-[env(safe-area-inset-top)] shadow-raised",
          "rounded-b-[4px] lg:rounded-[4px] lg:border lg:border-line-strong lg:shadow-pop",
        )}
      >
        {/* The brand is a headsign: a board on the first line of the
            search, not a bar across the top of the window. */}
        <div className="px-3 pt-3">
          <BrandLockup />
        </div>

        <div className="relative mt-2">
          {/* The route line between the two places. It runs under the
              markers and under the key that swaps them. */}
          <span
            aria-hidden
            className="absolute bottom-6 left-[23px] top-6 z-0 w-px bg-ink/70"
          />

          <div className="flex h-12 items-center gap-3 pl-3 pr-2 transition-colors focus-within:bg-surface-2/60">
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center">
              <span className="size-2.5 rounded-full border-2 border-ink bg-surface" />
            </span>
            <PlaceInput
              variant="row"
              label="From"
              value={origin}
              onValueChange={onOriginChange}
              onSelectPlace={onSelectOrigin}
              memory={memory}
              canSave={originCanSave}
              saved={originSaved}
              onToggleSaved={onToggleSavedOrigin}
              placeholder="From: stop, station, landmark"
              trailingAction={
                <button
                  type="button"
                  aria-label="Use my location"
                  title="Use my location"
                  aria-busy={locating || undefined}
                  disabled={locating}
                  onClick={onUseMyPosition}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-[4px] border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:cursor-wait disabled:opacity-50"
                >
                  <LocateFixed aria-hidden className="size-4" />
                </button>
              }
            />
          </div>

          <div className="flex h-12 items-center gap-3 pl-3 pr-2 transition-colors focus-within:bg-surface-2/60">
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center">
              <span className="size-2.5 rounded-full bg-ink" />
            </span>
            <PlaceInput
              variant="row"
              label="To"
              value={destination}
              onValueChange={onDestinationChange}
              onSelectPlace={onSelectDestination}
              memory={memory}
              canSave={destinationCanSave}
              saved={destinationSaved}
              onToggleSaved={onToggleSavedDestination}
              placeholder="To: stop, station, landmark"
              trailingAction={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSwapAngle((angle) => angle + 180);
                      onSwap();
                    }}
                    aria-label="Swap origin and destination"
                    title="Swap origin and destination"
                    className="flex size-11 cursor-pointer items-center justify-center rounded-[4px] border border-line bg-surface text-ink transition-colors hover:bg-surface-2"
                  >
                    <ArrowUpDown
                      aria-hidden
                      className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                      style={{ transform: `rotate(${swapAngle}deg)` }}
                    />
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    size="icon"
                    aria-label="Show route"
                    title="Show route"
                    onClick={onSubmit}
                    disabled={!canSearch}
                    className="size-11 rounded-[4px] shadow-none active:translate-y-px"
                  >
                    <ArrowRight aria-hidden className="size-4" />
                  </Button>
                </div>
              }
            />
          </div>

        </div>

        {/* The departure controls belong to the same board. They are not a
            second card underneath it, and a section is separated by space,
            not by a rule. */}
        <div className="flex flex-wrap items-center gap-3 px-3 pb-3 pt-2">
          <div
            role="group"
            aria-label="Departure time"
            className="relative inline-flex shrink-0 items-center"
          >
            <div className="grid grid-cols-2">
              <Tooltip label="Plan from the next scheduled departure. Times use operator service windows, not live vehicles.">
                <button
                  type="button"
                  onClick={() => onDepartureModeChange?.("now")}
                  aria-pressed={departureMode === "now"}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center justify-center gap-1 px-3 text-[13px] transition-colors",
                    departureMode === "now" ? "font-semibold text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <Clock3 aria-hidden className="size-3.5" />
                  Now
                </button>
              </Tooltip>
              <Tooltip label="Choose a departure time. The planner uses the service window that covers it.">
                <button
                  type="button"
                  onClick={() => {
                    onDepartureModeChange?.("at");
                    setTimePickerSignal((signal) => signal + 1);
                  }}
                  aria-pressed={departureMode === "at"}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center justify-center gap-1 px-3 text-[13px] transition-colors",
                    departureMode === "at" ? "font-semibold text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <CalendarClock aria-hidden className="size-3.5" />
                  Leave at
                </button>
              </Tooltip>
            </div>
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-0.5 w-1/2 bg-ink transition-transform duration-150 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
              style={{ transform: departureMode === "at" ? "translateX(100%)" : "translateX(0)" }}
            />
          </div>

          {departureMode === "at" ? (
            <TimePicker
              key={timePickerSignal}
              value={departureTime}
              onChange={(time) => onDepartureTimeChange?.(time)}
            />
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="flex items-start gap-2 rounded-[4px] border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-[1.5] text-ink-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <p>
            {notice.title}
            {notice.demonstration ? " Sample watch, not an operator announcement." : ""}
          </p>
        </div>
      ) : null}

      {walkError ? (
        <p className="px-1 text-[12px] leading-[1.5] text-danger">{walkError}</p>
      ) : null}
    </div>
  );
}
