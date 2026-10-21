import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/** The loading indicator. It always carries a label, never only a spinner. */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px] text-ink-3", className)}>
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/**
 * The empty state.
 *
 * It always says what happened and what to do next, so an empty screen is
 * never a dead end.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          {icon}
        </span>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {description ? (
          <p className="text-[13px] leading-[1.5] text-ink-3">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** A skeleton block used while a panel loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}
