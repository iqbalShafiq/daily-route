import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 flexible navigation bar.
 *
 * Four places at most. The active destination is a 56×32px pill behind the
 * icon, and the label stays visible: the pill is not the only carrier of the
 * state. On a wide screen the same items become a rail, so a desktop window
 * does not keep a phone bar across its bottom edge.
 */

export type M3NavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
  /** A number for a count, `true` for a dot, nothing for no badge. */
  badge?: number | boolean;
};

export type M3NavigationBarProps = {
  active: string;
  items: readonly M3NavigationItem[];
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
};

function badgeLabel(badge: number | boolean | undefined): string | null {
  if (typeof badge === "number") return badge > 0 ? `${badge} new` : null;
  return badge ? "New activity" : null;
}

function NavigationItem({
  item,
  active,
  onChange,
}: {
  item: M3NavigationItem;
  active: boolean;
  onChange: (id: string) => void;
}) {
  const badge = badgeLabel(item.badge);
  return (
    <button
      type="button"
      className={cn("m3-nav__item", active && "is-active")}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${item.label}, ${badge}` : undefined}
      onClick={() => onChange(item.id)}
    >
      <span className="m3-nav__pill">
        <span aria-hidden="true">{item.icon}</span>
        {typeof item.badge === "number" && item.badge > 0 ? (
          <span className="m3-nav__badge" aria-hidden="true">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
        {item.badge === true ? (
          <span className="m3-nav__badge m3-nav__badge--dot" aria-hidden="true" />
        ) : null}
      </span>
      <span>{item.label}</span>
    </button>
  );
}

export function M3NavigationBar({
  active,
  items,
  onChange,
  ariaLabel = "Primary",
  className,
}: M3NavigationBarProps) {
  return (
    <nav aria-label={ariaLabel} className={cn("m3-nav", className)}>
      {items.map((item) => (
        <NavigationItem key={item.id} item={item} active={item.id === active} onChange={onChange} />
      ))}
    </nav>
  );
}

export function M3NavigationRail({
  active,
  items,
  onChange,
  ariaLabel = "Primary",
  className,
}: M3NavigationBarProps) {
  return (
    <nav aria-label={ariaLabel} className={cn("m3-nav-rail", className)}>
      {items.map((item) => (
        <NavigationItem key={item.id} item={item} active={item.id === active} onChange={onChange} />
      ))}
    </nav>
  );
}
