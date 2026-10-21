import { LocateFixed } from "lucide-react";
import { useState } from "react";

import type { WalkRoute } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { formatDistance } from "../../lib/format.js";

/**
 * Walking from where the reader is.
 *
 * A rider who is standing somewhere needs to know two things: which stop
 * to walk to, and how to get there. The panel asks the browser where
 * they are, asks the server for the walk to the stop that serves that
 * place, and shows the street names along the way.
 */
export function WalkPanel({
  walk,
  className,
}: {
  /** The walk the server worked out, when there is one. */
  walk: WalkRoute | null;
  className?: string;
}) {
  const [message] = useState<string | null>(null);

  return (
    <div className={cn("rounded-card border border-line bg-surface-2/60 px-3 py-2.5", className)}>
      <div className="flex items-center gap-2">
        <LocateFixed aria-hidden className="size-4 shrink-0 text-ink-3" />
        <p className="min-w-0 flex-1 text-[13px] text-ink-2">
          {walk
            ? `Berjalan ${formatDistance(walk.distanceKm)} ke ${walk.stationName}`
            : "Mulai dari tempat Anda berada?"}
        </p>
      </div>

      {message ? <p className="mt-1.5 text-[12px] text-danger">{message}</p> : null}
      {!walk && !message ? (
        <p className="mt-1.5 text-[12px] text-ink-3">
          Tekan ikon lokasi di kolom &quot;Dari&quot; untuk mulai dari tempat Anda berada.
        </p>
      ) : null}

      {walk ? (
        <ol className="mt-2 space-y-1 border-t border-line pt-2">
          <li className="flex items-baseline justify-between gap-3 text-[12px] text-ink-2">
            <span className="min-w-0 truncate">
              Berjalan ke <span className="font-medium text-ink">{walk.stationName}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-3">
              {formatDistance(walk.distanceKm)} · {walk.durationMinutes} mnt
            </span>
          </li>
          {walk.steps
            .filter((step) => step.distanceKm > 0.005)
            .slice(0, 6)
            .map((step, index) => (
              <li key={`${step.instruction}-${index}`} className="flex items-baseline gap-2 text-[12px]">
                <span aria-hidden className="mt-1 size-1 shrink-0 rounded-full bg-ink-3" />
                <span className="min-w-0 flex-1 truncate text-ink-2">{step.instruction}</span>
                <span className="shrink-0 tabular-nums text-ink-3">
                  {formatDistance(step.distanceKm)}
                </span>
              </li>
            ))}
        </ol>
      ) : null}
    </div>
  );
}
