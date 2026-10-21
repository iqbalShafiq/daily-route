import { Footprints } from "lucide-react";

import type { PositionPlan } from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { formatDistance } from "../../lib/format.js";

/**
 * Where the journey starts from the reader's own position.
 *
 * The nearest stop is not always the right one, so the server weighs
 * every stop around the reader and answers with the journeys that come
 * out of them. Each one is a different question: the soonest, the one
 * with the fewest changes of vehicle, the one that asks the reader to
 * walk the least. They often start from different stops, and the reader
 * is the one who knows which they prefer.
 */
export function WalkPanel({
  plan,
  className,
  onChoose,
}: {
  /** The journey the server worked out, when there is one. */
  plan: PositionPlan | null;
  className?: string;
  /** Choose a different start, by its profile. */
  onChoose?: ((profileId: string) => void) | undefined;
}) {
  if (!plan) {
    return (
      <p className="px-4 pb-3 text-[12px] text-ink-3">
        Tekan ikon lokasi di kolom &quot;Dari&quot; untuk mulai dari tempat Anda berada.
      </p>
    );
  }

  if (plan.needsDestination) {
    return (
      <p className="px-4 pb-3 text-[12px] text-ink-3">
        Tulis tujuan dulu, lalu tekan ikon lokasi untuk mencari rute terbaik dari
        tempat Anda berada.
      </p>
    );
  }

  const walk = plan.walk;

  return (
    <div className={cn("px-4 pb-3", className)}>
      <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-ink-3">
        <Footprints aria-hidden className="size-3.5" />
        Mulai dari
      </p>

      <ul className="mt-2 space-y-1">
        {plan.profiles.map((profile) => {
          const chosen = profile.id === "fastest";
          return (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => onChoose?.(profile.id)}
                className={cn(
                  "flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-2 text-left transition-colors",
                  chosen ? "bg-accent-soft" : "hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    chosen ? "font-medium text-ink" : "text-ink-2",
                  )}
                >
                  {profile.label}
                </span>
                <span className="shrink-0 truncate text-[12px] text-ink-3">
                  {profile.stationName}
                </span>
                <span className="shrink-0 tabular-nums text-[12px] text-ink-2">
                  {profile.totalMinutes ?? "-"} mnt
                </span>
                <span className="shrink-0 tabular-nums text-[12px] text-ink-3">
                  {profile.transferCount ?? 0}×
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {walk ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-[12px] text-ink-2">
            Berjalan {formatDistance(walk.distanceKm)} ke {plan.stationName},{" "}
            {walk.durationMinutes} mnt
          </p>
          <ol className="mt-1 space-y-0.5">
            {walk.steps
              .filter((step) => step.distanceKm > 0.005)
              .slice(0, 5)
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
        </div>
      ) : null}
    </div>
  );
}
