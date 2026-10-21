import { LocateFixed, Navigation } from "lucide-react";
import { useState } from "react";

import { api, ApiError, type WalkRoute } from "../../lib/api.js";
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
  onWalk,
  className,
}: {
  onWalk: (walk: WalkRoute) => void;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "asking" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [walk, setWalk] = useState<WalkRoute | null>(null);

  const locate = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("failed");
      setMessage("Perangkat ini tidak dapat menentukan lokasi.");
      return;
    }
    setState("asking");
    setMessage(null);

    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      });
    });
    if (!position) {
      setState("failed");
      setMessage("Lokasi tidak bisa dibaca. Izinkan akses lokasi lalu coba lagi.");
      return;
    }

    try {
      const route = await api.walk({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setWalk(route);
      setState("idle");
      onWalk(route);
    } catch (error) {
      setState("failed");
      setMessage(
        error instanceof ApiError ? error.message : "Rute jalan kaki belum bisa dihitung.",
      );
    }
  };

  return (
    <div className={cn("rounded-card border border-line bg-surface-2/60 px-3 py-2.5", className)}>
      <div className="flex items-center gap-2">
        <LocateFixed aria-hidden className="size-4 shrink-0 text-ink-3" />
        <p className="min-w-0 flex-1 text-[13px] text-ink-2">
          {walk
            ? `Berjalan ${formatDistance(walk.distanceKm)} ke ${walk.stationName}`
            : "Mulai dari tempat Anda berada?"}
        </p>
        <button
          type="button"
          onClick={locate}
          disabled={state === "asking"}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Navigation aria-hidden className="size-3.5" />
          {state === "asking" ? "Mencari…" : walk ? "Ulangi" : "Gunakan posisi saya"}
        </button>
      </div>

      {message ? <p className="mt-1.5 text-[12px] text-danger">{message}</p> : null}

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
