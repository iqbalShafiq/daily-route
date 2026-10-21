import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The card.
 *
 * A card is the app's one container: a planner section, an itinerary, an
 * alert. It never nests inside another card — that is the difference
 * between a layout and a stack of boxes.
 *
 * It has a hairline border and no shadow. A shadow belongs to what
 * floats above the page, not to a box that sits on it.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
});

export type CardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

export function CardHeader({ title, description, actions, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-3", className)}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}
