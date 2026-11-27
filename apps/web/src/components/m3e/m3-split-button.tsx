import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn.js";
import { safeId } from "./m3e-utils.js";
import { M3Button, type M3ButtonVariant } from "./m3-button.js";

/**
 * The split button.
 *
 * The primary action is the left part. The trailing part opens a vibrant
 * vertical menu: while it is open the chevron turns 180° and the trailing
 * corner becomes a full circle. Escape and a pointer outside both dismiss it,
 * and Escape returns focus to the trigger.
 */

export type M3SplitButtonMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Items with the same group sit together; a gap separates the groups. */
  group?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type M3SplitButtonProps = {
  label: string;
  icon?: ReactNode;
  onPrimaryClick: () => void;
  menuItems: readonly M3SplitButtonMenuItem[];
  size?: "s" | "m";
  variant?: Extract<M3ButtonVariant, "filled" | "tonal" | "vibrant">;
  className?: string;
  menuLabel?: string;
  disabled?: boolean;
};

type MenuGroup = {
  key: string;
  items: M3SplitButtonMenuItem[];
};

function groupItems(items: readonly M3SplitButtonMenuItem[]): MenuGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, M3SplitButtonMenuItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    const existing = byKey.get(key);
    if (existing) {
      existing.push(item);
    } else {
      byKey.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => ({ key, items: byKey.get(key) ?? [] }));
}

export function M3SplitButton({
  label,
  icon,
  onPrimaryClick,
  menuItems,
  size = "s",
  variant = "filled",
  className,
  menuLabel,
  disabled = false,
}: M3SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = `m3-split-menu-${safeId(useId())}`;
  const groups = useMemo(() => groupItems(menuItems), [menuItems]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Move focus into the menu so a keyboard reader is not left behind.
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    first?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    if (items.length === 0) return;
    if (event.key === "Home") {
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      items[items.length - 1]?.focus();
      return;
    }
    const active = document.activeElement;
    const current = items.findIndex((item) => item === active);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = ((current < 0 ? 0 : current + delta) + items.length) % items.length;
    items[next]?.focus();
  };

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={cn("m3-split", size === "m" && "m3-split--m", open && "is-open", className)}
    >
      <M3Button
        size={size}
        variant={variant}
        icon={icon}
        onClick={onPrimaryClick}
        disabled={disabled}
      >
        {label}
      </M3Button>
      <M3Button
        ref={triggerRef}
        size={size}
        variant={variant}
        className="m3-split__toggle"
        aria-label={open ? "Close menu" : "More actions"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          className="m3-split__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </M3Button>

      {open ? (
        <div className="m3-split__menu" ref={menuRef}>
          <div
            id={menuId}
            role="menu"
            aria-label={menuLabel ?? `${label} menu`}
            className="m3-menu"
            onKeyDown={handleMenuKeyDown}
          >
            {groups.map((group) => (
              <div
                key={group.key}
                className="m3-menu__group m3-menu__group--vibrant"
                role="group"
                aria-label={group.key || undefined}
              >
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={cn("m3-menu__item", item.selected && "is-selected")}
                    disabled={item.disabled}
                    aria-current={item.selected ? "true" : undefined}
                    onClick={() => {
                      item.onSelect();
                      close();
                    }}
                  >
                    {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
