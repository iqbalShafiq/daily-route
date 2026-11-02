import {
  Bell,
  MessageSquare,
  Route,
  Network,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../../lib/cn.js";

export type MobileTab = "plan" | "network" | "alerts" | "assistant";

const TABS: {
  id: MobileTab;
  label: string;
  icon: typeof Route;
  ariaLabel: string;
}[] = [
  { id: "plan", label: "Plan", icon: Route, ariaLabel: "Plan a journey" },
  { id: "network", label: "Lines", icon: Network, ariaLabel: "Network and lines" },
  { id: "alerts", label: "Alerts", icon: Bell, ariaLabel: "Service notices" },
  {
    id: "assistant",
    label: "Ask",
    icon: MessageSquare,
    ariaLabel: "Ask the assistant",
  },
];

/**
 * The bottom app bar on a phone.
 *
 * Four places, one route line. The active stop is marked twice: a jade
 * rule on the top edge and a paper plate behind the label. That is the
 * same language the map uses for a station, so the bar reads as part of
 * the city rather than as a browser chrome.
 */
export function MobileTabBar({
  active,
  noticeCount,
  onChange,
}: {
  active: MobileTab;
  noticeCount: number;
  onChange: (tab: MobileTab) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-24px_var(--ink)] lg:hidden"
    >
      {/* The route line that joins the four stops. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-line-strong/70"
      />
      <div className="relative mx-auto grid h-[var(--bottom-bar-h)] max-w-lg grid-cols-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-label={tab.ariaLabel}
              aria-current={selected ? "page" : undefined}
              className="group relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
            >
              {selected ? (
                <motion.span
                  layoutId="mobile-tab-plate"
                  className="absolute inset-x-2 inset-y-1 rounded-md bg-surface-2"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
                  }
                />
              ) : null}
              <span className="relative flex h-5 items-center justify-center">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-[18px] transition-transform duration-200 group-active:scale-90",
                    selected ? "text-ink" : "text-ink-3 group-hover:text-ink-2",
                  )}
                  strokeWidth={selected ? 2.4 : 1.8}
                />
                {tab.id === "alerts" && noticeCount > 0 ? (
                  <span className="absolute -right-3 -top-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[12px] font-semibold leading-[1.2] tabular-nums text-accent-ink">
                    {noticeCount > 99 ? "99" : noticeCount}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "relative font-mono text-[12px] uppercase leading-[1.2] tracking-[0.08em] transition-colors",
                  selected ? "font-semibold text-ink" : "text-ink-3",
                )}
              >
                {tab.label}
              </span>
              {selected ? (
                <motion.span
                  layoutId="mobile-tab-rule"
                  className="absolute inset-x-5 top-0 h-0.5 bg-accent"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
                  }
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
