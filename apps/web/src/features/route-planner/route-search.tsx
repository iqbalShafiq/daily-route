import { ArrowRightLeft, LocateFixed, Navigation, Route as RouteIcon } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import type { PositionPlan } from "../../lib/api.js";

import { PlaceInput } from "./place-input.js";
import { WalkPanel } from "./walk-panel.js";

/**
 * The search card.
 *
 * It floats over the map, because the map is the context of the
 * question: a rider who is looking at a stop wants to know how to get
 * to it, not to read a form on a white page.
 */
export function RouteSearch({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSubmit,
  onUseMyPosition,
  onChooseOrigin,
  onOpenAssistant,
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
  /** Open the assistant, which reads the same data. */
  onOpenAssistant?: (() => void) | undefined;
  /** The walk from the reader's place to the stop, when it is known. */
  walk?: PositionPlan | null | undefined;
  className?: string;
}) {
  return (
    <Card className={className}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-3 px-4 py-4"
      >
        <PlaceInput
          label="Dari"
          value={origin}
          onValueChange={onOriginChange}
          placeholder="Stasiun, halte, atau landmark"
          icon={<Navigation aria-hidden className="size-4" />}
          trailingAction={
            <button
              type="button"
              aria-label="Gunakan posisi saya"
              title="Gunakan posisi saya"
              onClick={onUseMyPosition}
              className="flex size-8 max-md:size-11 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LocateFixed aria-hidden className="size-4" />
            </button>
          }
        />

        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              onOriginChange(destination);
              onDestinationChange(origin);
            }}
            aria-label="Tukar asal dan tujuan"
            className="border border-line bg-surface"
          >
            <ArrowRightLeft aria-hidden className="size-4" />
          </Button>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>

        <PlaceInput
          label="Ke"
          value={destination}
          onValueChange={onDestinationChange}
          placeholder="Stasiun, halte, atau landmark"
          icon={<RouteIcon aria-hidden className="size-4" />}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" size="lg" className="flex-1">
            Tampilkan rute
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onOpenAssistant}
            className="shrink-0"
          >
            Tanya
          </Button>
        </div>
      </form>

      {walk !== undefined ? (
        <div className="border-t border-line px-4 py-3">
          <WalkPanel plan={walk ?? null} onChoose={onChooseOrigin} />
        </div>
      ) : null}
    </Card>
  );
}
