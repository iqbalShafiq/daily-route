import { CircleCheck, ExternalLink, TriangleAlert } from "lucide-react";

import { cn } from "../../lib/cn.js";
import {
  DISRUPTION_KIND_LABEL,
  SEVERITY_LABEL,
  formatRelative,
} from "../../lib/format.js";
import type { DisruptionSummary } from "../../lib/api.js";

/**
 * The disruption banner.
 *
 * An alert about the route always comes before the itinerary: a rider needs
 * to know that the route they are about to take is the one that is being
 * diverted.
 */
export function DisruptionBanner({
  disruption,
  className,
}: {
  disruption: DisruptionSummary;
  className?: string;
}) {
  const tone =
    disruption.severity === "critical" || disruption.severity === "severe"
      ? "danger"
      : disruption.severity === "warning"
        ? "warn"
        : "info";

  const toneClasses = {
    danger: "border-danger/35 bg-danger-soft text-danger",
    warn: "border-warn/35 bg-warn-soft text-warn",
    info: "border-info/35 bg-info-soft text-info",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3 py-3", toneClasses, className)}>
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-[1.3]">{disruption.title}</p>
          {disruption.body ? (
            <p className="mt-0.5 text-[12px] leading-[1.5] opacity-90">{disruption.body}</p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] opacity-80">
            <span>{DISRUPTION_KIND_LABEL[disruption.kind] ?? disruption.kind}</span>
            <span aria-hidden>·</span>
            <span>{SEVERITY_LABEL[disruption.severity] ?? disruption.severity}</span>
            <span aria-hidden>·</span>
            <span>{formatRelative(disruption.publishedAt)}</span>
            {disruption.url ? (
              <a
                href={disruption.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                Sumber
                <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

/** A note that the route is running normally. */
export function ClearRouteNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] text-accent",
        className,
      )}
    >
      <CircleCheck aria-hidden className="size-4 shrink-0" />
      <span>Tidak ada pengalihan atau penutupan yang memengaruhi rute ini.</span>
    </div>
  );
}
