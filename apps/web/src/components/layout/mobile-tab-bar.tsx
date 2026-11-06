import {
  Bell,
  MessageSquare,
  Route,
  Network,
} from "lucide-react";

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
 * Four places, one route line. The active place is an ink underline under
 * its label: no plate, no coloured rule across the top, and nothing around
 * the icon.
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
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-24px_var(--ink)] lg:hidden"
    >
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
              className="group relative flex cursor-pointer flex-col items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
            >
              <span className="relative flex h-5 items-center justify-center">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-[18px]",
                    selected ? "text-ink" : "text-ink-3 group-hover:text-ink-2",
                  )}
                  strokeWidth={selected ? 2.4 : 1.8}
                />
                {tab.id === "alerts" && noticeCount > 0 ? (
                  <span className="absolute -right-3 -top-1 flex min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[12px] font-semibold leading-[1.2] tabular-nums text-accent-ink">
                    {noticeCount > 99 ? "99" : noticeCount}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "relative px-1 text-[12px] leading-[1.35]",
                  selected ? "font-semibold text-ink" : "text-ink-3",
                )}
              >
                {tab.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 -bottom-0.5 h-0.5 origin-left bg-ink transition-transform duration-150 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none",
                    selected ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
