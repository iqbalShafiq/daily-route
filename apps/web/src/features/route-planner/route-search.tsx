import { ArrowRight, ArrowRightLeft, LocateFixed, MapPin, Navigation } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { cn } from "../../lib/cn.js";
import type { PositionPlan } from "../../lib/api.js";

import { PlaceInput } from "./place-input.js";
import { WalkPanel } from "./walk-panel.js";

/**
 * The search surface.
 *
 * It is one object over the map, not a card that holds a form. The two
 * places it holds are two lines of the same surface, divided by a
 * hairline, and the button that runs the search sits at the end of the
 * second line, where a thumb expects it.
 *
 * On a phone the surface is the full width of the window: a bar at the
 * top of the map, with the map still behind it. On a wide screen it
 * floats in the corner, because there the map is the wider thing.
 */
export function RouteSearch({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSubmit,
  onUseMyPosition,
  onChooseOrigin,
  walk,
  className,
}: {
  origin: string;
  destination: string;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
  /** Ask the browser where the reader is, and plan from there. */
  onUseMyPosition?: (() => void) | undefined;
  /** Choose a different start: the fewest transfers, or the least walking. */
  onChooseOrigin?: ((profileId: string) => void) | undefined;
  /** The walk from the reader's place to the stop, when it is known. */
  walk?: PositionPlan | null | undefined;
  className?: string;
}) {
  const canSearch = destination.trim().length > 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "relative bg-surface shadow-pop ring-1 ring-line",
          // Full width on a phone: the bar belongs to the window, so the
          // window's corners are the only corners it has.
          "rounded-b-[14px] lg:rounded-[14px]",
        )}
      >
        <div className="flex h-12 items-center gap-3 pl-4 pr-3">
          <PlaceInput
            variant="row"
            label="Dari"
            value={origin}
            onValueChange={onOriginChange}
            placeholder="Halte, stasiun, atau landmark"
            icon={<Navigation aria-hidden className="size-4" />}
            trailingAction={
              <button
                type="button"
                aria-label="Gunakan posisi saya"
                title="Gunakan posisi saya"
                onClick={onUseMyPosition}
                className="flex size-8 max-md:size-10 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <LocateFixed aria-hidden className="size-4" />
              </button>
            }
          />
        </div>

        {/*
         * The hairline between the two places. It lies on the surface
         * instead of taking room from it, so the two lines keep the
         * same height and the surface keeps the same height on every
         * screen.
         */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />

        {/*
         * The button that swaps the two places.
         *
         * It sits in the middle of the surface, in the column of the
         * icons, on the hairline. It is centred on the same line as the
         * two icons, so the three read as one column and not as three
         * things that happen to be near each other.
         */}
        <button
          type="button"
          onClick={() => {
            onOriginChange(destination);
            onDestinationChange(origin);
          }}
          aria-label="Tukar asal dan tujuan"
          title="Tukar asal dan tujuan"
          className="absolute top-1/2 left-1 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink"
        >
          <span className="flex size-6 items-center justify-center rounded-full border border-line bg-surface shadow-raised">
            <ArrowRightLeft aria-hidden className="size-3" />
          </span>
        </button>

        <div className="flex h-12 items-center gap-3 pl-4 pr-3">
          <PlaceInput
            variant="row"
            label="Ke"
            value={destination}
            onValueChange={onDestinationChange}
            placeholder="Halte, stasiun, atau landmark"
            icon={<MapPin aria-hidden className="size-4" />}
            trailingAction={
              <Button
                type="button"
                variant="primary"
                size="icon"
                aria-label="Tampilkan rute"
                title="Tampilkan rute"
                onClick={onSubmit}
                disabled={!canSearch}
                className="size-8 max-md:size-10 rounded-full"
              >
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      {walk ? (
        <div className="mx-3 rounded-[14px] bg-surface px-4 py-3 shadow-pop ring-1 ring-line lg:mx-0">
          <WalkPanel plan={walk} onChoose={onChooseOrigin} />
        </div>
      ) : null}
    </div>
  );
}
