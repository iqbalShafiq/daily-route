import { Clock3 } from "lucide-react";

import { Tooltip } from "../ui/tooltip.js";
import { cn } from "../../lib/cn.js";
import type { ItineraryLeg } from "../../lib/api.js";

/**
 * The scheduled frequency of a ride.
 *
 * The chip is deliberately wordless: the colour carries the band and the
 * number carries the wait. Pointing at it opens the service window, so the
 * rider can see why a corridor is marked rare or frequent without putting
 * another sentence in the leg row.
 */
export function ServiceChip({ leg }: { leg: ItineraryLeg }) {
  if (leg.kind !== "ride") return null;

  if (leg.outsideService) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-danger-soft px-2 py-px text-[12px] leading-[1.35] font-medium text-danger">
        <Clock3 aria-hidden className="size-3" />
        Tidak beroperasi
      </span>
    );
  }

  const min = leg.headwayMinMinutes ?? null;
  const max = leg.headwayMaxMinutes ?? null;
  if (min === null || max === null) {
    return <span className="text-[12px] text-ink-3">Jadwal belum diketahui</span>;
  }

  const median = leg.waitMinutes > 0 ? leg.waitMinutes * 2 : (min + max) / 2;
  const band =
    median <= 5
      ? "very-frequent"
      : median <= 10
        ? "frequent"
        : median <= 15
          ? "regular"
          : median <= 25
            ? "infrequent"
            : "rare";
  const range =
    Math.round(min) === Math.round(max)
      ? `${Math.round(median)} min`
      : `${Math.round(min)}-${Math.round(max)} min`;
  const tone =
    band === "very-frequent" || band === "frequent"
      ? "bg-surface-3 text-ink"
      : band === "regular"
        ? "bg-info-soft text-info"
        : band === "infrequent"
          ? "bg-warn-soft text-warn"
          : "bg-danger-soft text-danger";
  const description =
    band === "rare"
      ? "Layanan jarang"
      : band === "infrequent"
        ? "Layanan tidak sering"
        : band === "regular"
          ? "Layanan reguler"
          : "Layanan sering";

  return (
    <Tooltip
      variant="panel"
      label={
        <div>
          <p className="text-[12px] font-semibold leading-[1.35] text-ink-3">
            Jendela layanan
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            Setiap {range}
            {leg.serviceDetail ? ` · ${leg.serviceDetail}` : ""}
          </p>
          <p className="mt-1 text-[12px] text-ink-3">
            Layanan terjadwal, bukan kedatangan langsung. Warna chip menandai seberapa sering layanan berjalan.
          </p>
        </div>
      }
    >
      <span
        tabIndex={0}
        aria-label={`${description}, every ${range}. ${leg.serviceDetail ?? ""}`}
        className={cn(
          "inline-flex cursor-help items-center gap-1 rounded-[4px] px-2 py-px font-mono text-[12px] leading-[1.2] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink",
          tone,
        )}
      >
        <Clock3 aria-hidden className="size-3" />
        {range}
      </span>
    </Tooltip>
  );
}
