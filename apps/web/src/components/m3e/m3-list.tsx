import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";
import { m3ShapeClipPath, type M3ShapeName } from "./m3-shape.js";

/**
 * The M3 Expressive list.
 *
 * Items sit 2px apart. The first and the last have 20px outer corners and
 * 4px inner corners; a selected item is a 20px pill on every corner. A list
 * with one item is a single 20px card, which is why the shape is expressed in
 * CSS rather than in a prop.
 */

export type M3ExpressiveListProps = {
  surface?: "lowest" | "low";
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

export function M3ExpressiveList({
  surface = "lowest",
  ariaLabel,
  className,
  children,
}: M3ExpressiveListProps) {
  return (
    <ul
      className={cn("m3-list", surface === "low" && "m3-list--low", className)}
      aria-label={ariaLabel}
    >
      {children}
    </ul>
  );
}

export type M3ExpressiveListItemProps = {
  leading?: ReactNode;
  leadingShape?: M3ShapeName;
  leadingTone?: "secondary" | "tertiary" | "primary";
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  as?: "button" | "a" | "div";
  className?: string;
};

export function M3ExpressiveListItem({
  leading,
  leadingShape = "circle",
  leadingTone = "secondary",
  title,
  subtitle,
  trailing,
  selected = false,
  onClick,
  href,
  disabled = false,
  as,
  className,
}: M3ExpressiveListItemProps) {
  const content = (
    <>
      {leading ? (
        <span
          className={cn("m3-list__lead", `m3-list__lead--${leadingTone}`)}
          style={{ clipPath: m3ShapeClipPath(leadingShape) }}
          aria-hidden="true"
        >
          {leading}
        </span>
      ) : null}
      <span className="m3-list__text">
        <span className="m3-list__title">{title}</span>
        {subtitle ? <span className="m3-list__subtitle">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="m3-list__trailing">{trailing}</span> : null}
    </>
  );

  const itemClass = cn("m3-list__item", selected && "is-selected", className);
  const tag = as ?? (href ? "a" : onClick ? "button" : "div");

  if (tag === "a") {
    return (
      <li className={itemClass}>
        <a
          className="m3-list__row"
          href={disabled ? undefined : href}
          tabIndex={disabled ? -1 : undefined}
          aria-current={selected ? "true" : undefined}
          aria-disabled={disabled ? true : undefined}
          onClick={disabled ? undefined : onClick}
        >
          {content}
        </a>
      </li>
    );
  }

  if (tag === "button" || onClick) {
    return (
      <li className={itemClass}>
        <button
          type="button"
          className="m3-list__row"
          disabled={disabled}
          aria-current={selected ? "true" : undefined}
          onClick={onClick}
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li className={itemClass}>
      <div className="m3-list__row">{content}</div>
    </li>
  );
}
