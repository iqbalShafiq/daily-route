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
 * second line, where a map application puts it. Nothing about the
 * search is boxed inside anything else.
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
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative rounded-[14px] bg-surface shadow-pop ring-1 ring-line">
        <div className="flex h-14 items-center gap-3 px-4">
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

        {/* The hairline between the two places. */}
        <div className="h-px bg-line" />

        {/*
         * The button that swaps the two places. It sits in the middle
         * of the surface, in the column of the icons, where it cannot
         * cover the controls at the end of a line.
         */}
        <button
          type="button"
          onClick={() => {
            onOriginChange(destination);
            onDestinationChange(origin);
          }}
          aria-label="Tukar asal dan tujuan"
          title="Tukar asal dan tujuan"
          className="absolute top-1/2 left-3 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-raised transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowRightLeft aria-hidden className="size-3.5" />
        </button>

        <div className="flex h-14 items-center gap-3 px-4">
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
                className="size-8 max-md:size-10 rounded-full"
              >
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            }
          />
        </div>
      </div>

      {walk ? (
        <div className="rounded-[14px] bg-surface px-4 py-3 shadow-pop ring-1 ring-line">
          <WalkPanel plan={walk} onChoose={onChooseOrigin} />
        </div>
      ) : null}
    </div>
  );
}
