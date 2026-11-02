import { useQuery } from "@tanstack/react-query";
import { Clock3, MapPin, Network, Users } from "lucide-react";
import { createPortal } from "react-dom";

import { api } from "../../lib/api.js";

/**
 * The card that tells what a stop is.
 *
 * The list names a stop; this card says what kind of place it is, which
 * lines stand there and what can be reached on foot from it. It opens
 * when the reader points at a name, because that is the moment the
 * reader is wondering what the name means.
 */
export function StopPopover({
  stationId,
  name,
  anchor,
}: {
  stationId: string | null;
  /** The name as the list writes it. */
  name: string;
  /** Where the name stands on the screen. */
  anchor: DOMRect | null;
}) {
  const detail = useQuery({
    queryKey: ["station", stationId],
    queryFn: ({ signal }) => api.station(stationId ?? "", signal),
    enabled: stationId !== null,
    staleTime: 300_000,
    retry: false,
  });
  const departures = useQuery({
    queryKey: ["departures", stationId],
    queryFn: ({ signal }) => api.departures(stationId ?? "", undefined, signal),
    enabled: stationId !== null,
    staleTime: 60_000,
    retry: false,
  });

  if (!stationId || !anchor) return null;

  const place = detail.data;
  const lines = place?.lines ?? [];
  const interchange = place?.interchangeWith ?? [];

  // The card stands beside the name. When there is no room beside it,
  // it stands below it.
  const width = 288;
  const beside = window.innerWidth - anchor.right > width + 24;
  const left = beside ? anchor.right + 12 : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
  const topCandidate = beside ? anchor.top : anchor.bottom + 8;
  const top = Math.max(12, Math.min(topCandidate, window.innerHeight - 380));

  return createPortal(
    <div
      role="dialog"
      aria-label={`Details for ${name}`}
      style={{ left: `${left}px`, top: `${top}px`, width: `${width}px` }}
      className="fade-in fixed z-50 rounded-[10px] border border-line bg-surface p-3 shadow-pop"
    >
      <p className="text-[13px] font-semibold text-ink">{name}</p>

      {place ? (
        <>
          <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
            {place.stationType === "stasiun" ? (
              <Network aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <MapPin aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {place.stationType === "stasiun" ? "Station" : "Stop"}
              {place.area ? ` · ${place.area}` : ""}
            </span>
          </p>

          {place.description ? (
            <p className="mt-2 text-[12px] leading-[1.45] text-ink-2">{place.description}</p>
          ) : null}

          {lines.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-1">
              {lines.slice(0, 8).map((line) => (
                <span
                  key={line.id}
                  className="rounded-[4px] bg-surface-2 px-2 py-px font-mono text-[12px] text-ink-2"
                >
                  {line.code}
                </span>
              ))}
              {lines.length > 8 ? (
                <span className="text-[12px] text-ink-3">+{lines.length - 8}</span>
              ) : null}
            </p>
          ) : null}

          {departures.data && departures.data.lines.length > 0 ? (
            <div className="mt-3 border-t border-line pt-2">
              <p className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
                <Clock3 aria-hidden className="size-3" />
                Scheduled departures
              </p>
              <ul className="mt-2 space-y-2">
                {departures.data.lines.slice(0, 6).map((row) => (
                  <li key={`${row.lineId}-${row.direction}`} className="flex items-baseline gap-2">
                    <span className="w-10 shrink-0 rounded-[3px] bg-surface-2 px-1 py-px text-center font-mono text-[12px] text-ink-2">
                      {row.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                      {row.headsign ?? row.name}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
                      {row.headwayMinMinutes === null
                        ? "unknown"
                        : `~${Math.round(row.headwayMinMinutes)} min`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] leading-[1.45] text-ink-3">
                Schedule-based, not live arrivals.
              </p>
            </div>
          ) : null}

          {interchange.length > 0 ? (
            <p className="mt-2 flex items-start gap-2 text-[12px] leading-[1.45] text-ink-2">
              <Users aria-hidden className="mt-px size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0">
                Connects with {interchange.map((other) => other.name).join(", ")}
              </span>
            </p>
          ) : null}
        </>
      ) : detail.isError ? (
        <p className="mt-2 text-[12px] text-ink-3">Place details could not be loaded.</p>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">Loading details…</p>
      )}
    </div>,
    document.body,
  );
}
