import { Bell, ChevronDown, RadioTower, Route as RouteIcon, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NETWORK_SYSTEMS, OperatorBadge } from "../map/operator-mark.js";
import { ServiceMark } from "../transit/service-mark.js";
import { Tooltip } from "../ui/tooltip.js";
import { cn } from "../../lib/cn.js";
import type { MapLeg } from "../map/route-map.js";
import type { DisruptionSummary } from "../../lib/api.js";
import { MonitorStatus } from "../../features/monitor/monitor-status.js";

export type NetworkDockTab = "lines" | "notices";

/**
 * The network service board.
 *
 * One paper dock for the two things a rider checks before moving: which
 * operators are on the map, and what the operators have announced. The
 * sections are tabs because the notice board needs the room, and the
 * bottom bar on a phone can open either one directly.
 */
export function NetworkDock({
  legs,
  networkReady,
  networkError,
  hiddenSystems,
  onToggleSystem,
  systemCounts,
  notices,
  noticesReady,
  noticesError,
  activeId,
  onShow,
  onRetry,
  open = true,
  onToggleOpen,
  tab,
  onTabChange,
  onClose,
  hiddenFromKeyboard = false,
  className,
}: {
  legs: readonly MapLeg[];
  networkReady: boolean;
  networkError: boolean;
  hiddenSystems: ReadonlySet<string>;
  onToggleSystem: (id: string) => void;
  systemCounts: Readonly<Record<string, number>>;
  notices: readonly DisruptionSummary[];
  noticesReady: boolean;
  noticesError: boolean;
  activeId: string | null;
  onShow: (notice: DisruptionSummary) => void;
  onRetry?: (() => void) | undefined;
  open?: boolean;
  onToggleOpen?: (() => void) | undefined;
  tab: NetworkDockTab;
  onTabChange: (tab: NetworkDockTab) => void;
  onClose?: (() => void) | undefined;
  /** Remove the sheet from the keyboard order while it is off-screen. */
  hiddenFromKeyboard?: boolean | undefined;
  className?: string;
}) {
  const activeNotices = notices.filter((notice) => notice.activeNow).length;
  const onSystems = NETWORK_SYSTEMS.filter((entry) => !hiddenSystems.has(entry.id)).length;

  const panelRef = useRef<HTMLDivElement>(null);
  const panelInnerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const onResize = () => setResizeTick((tick) => tick + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /*
   * The two sections do not have the same height, and a CSS transition
   * cannot interpolate `height: auto`. Measure the new panel, then set the
   * wrapper to that height so the tab switch is one continuous movement.
   *
   * The measurement happens in a layout effect: the wrapper still has the
   * old height, so the browser can animate from it to the new one. `display:
   * block` lets the panel report its natural height while the outer box is
   * still clipped.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const inner = panelInnerRef.current;
    if (!panel || !inner) return;
    const aside = panel.closest("aside");
    if (!aside) return;

    const maxDock = Number.parseFloat(getComputedStyle(aside).maxHeight);
    const chrome = (headerRef.current?.offsetHeight ?? 0) + (tabsRef.current?.offsetHeight ?? 0);
    const fallback = Math.min(window.innerHeight * 0.62, 560);
    const cap = Math.max(120, (Number.isFinite(maxDock) ? maxDock : fallback) - chrome);

    const previousHeight = inner.style.height;
    const previousMaxHeight = inner.style.maxHeight;
    const previousDisplay = inner.style.display;
    inner.style.height = "auto";
    inner.style.maxHeight = `${cap}px`;
    inner.style.display = "block";
    const natural = inner.getBoundingClientRect().height;
    inner.style.height = previousHeight;
    inner.style.maxHeight = previousMaxHeight;
    inner.style.display = previousDisplay;

    const next = Math.min(cap, Math.max(0, Math.round(natural)));
    panel.style.height = `${next}px`;
    inner.style.height = `${next}px`;
  }, [open, tab, legs.length, notices.length, networkReady, noticesReady, resizeTick]);

  return (
    <aside
      aria-label="Network and service notices"
      aria-hidden={hiddenFromKeyboard || undefined}
      inert={hiddenFromKeyboard || undefined}
      className={cn(
        "panel flex flex-col overflow-hidden rounded-[12px] border-t-2 border-t-ink",
        "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        "max-h-[calc(100dvh-var(--bar-h)-var(--bottom-bar-h)-24px)] lg:max-h-[min(62dvh,560px)]",
        className,
      )}
    >
      <header
        ref={headerRef}
        className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-3 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-accent-soft text-accent">
            <RadioTower aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Service board</p>
            <p className="truncate text-[13px] font-semibold leading-[1.3] text-ink">
              Lines &amp; notices
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close service board"
              className="ml-1 flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
          {onToggleOpen ? (
            <button
              type="button"
              onClick={onToggleOpen}
              aria-expanded={open}
              aria-label={open ? "Collapse service board" : "Expand service board"}
              className="hidden size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:flex"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
                  open ? "rotate-0" : "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
      </header>

      <div
        aria-hidden={!open}
        inert={!open || undefined}
        className={cn(
          "grid min-h-0 flex-1 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Service board sections"
            className="grid shrink-0 grid-cols-2 border-b border-line/70"
          >
            <DockTab
              active={tab === "lines"}
              onClick={() => onTabChange("lines")}
              icon={<RouteIcon aria-hidden className="size-3.5" />}
              label="Lines"
              meta={`${onSystems}/${NETWORK_SYSTEMS.length}`}
            />
            <DockTab
              active={tab === "notices"}
              onClick={() => onTabChange("notices")}
              icon={<Bell aria-hidden className="size-3.5" />}
              label="Notices"
              meta={String(activeNotices)}
            />
          </div>

          <div
            ref={panelRef}
            className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          >
            <div ref={panelInnerRef} className="flex min-h-0 flex-col">
              <div key={tab} className="fade-in flex min-h-0 flex-1 flex-col overflow-hidden">
                {tab === "lines" ? (
                  <MapLegend
                    legs={legs}
                    networkReady={networkReady}
                    networkError={networkError}
                    hiddenSystems={hiddenSystems}
                    onToggleSystem={onToggleSystem}
                    systemCounts={systemCounts}
                  />
                ) : (
                  <MonitorStatus
                    notices={notices}
                    noticesReady={noticesReady}
                    noticesError={noticesError}
                    activeId={activeId}
                    onShow={onShow}
                    onRetry={onRetry}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DockTab({
  active,
  onClick,
  icon,
  label,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex h-10 cursor-pointer items-center justify-center gap-2 text-[13px] font-semibold transition-colors",
        active ? "text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[12px] font-medium tabular-nums text-ink-3">{meta}</span>
      {active ? (
        <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 bg-accent" />
      ) : null}
    </button>
  );
}

/**
 * The legend of the map, and the switch for each operator.
 *
 * Pressing a row hides that operator's lines and stops. Pressing it
 * again brings them back. A journey still lists the vehicles it uses.
 */
function MapLegend({
  legs,
  networkReady,
  networkError,
  hiddenSystems,
  onToggleSystem,
  systemCounts,
}: {
  legs: readonly MapLeg[];
  networkReady: boolean;
  networkError: boolean;
  hiddenSystems: ReadonlySet<string>;
  onToggleSystem: (id: string) => void;
  systemCounts: Readonly<Record<string, number>>;
}) {
  const entries = useMemo(() => {
    const seen = new Map<
      string,
      { color: string; label: string; serviceClass: string | null; systemId: string | null }
    >();
    for (const leg of legs) {
      if (leg.kind !== "ride" || leg.dashed) continue;
      // One mark per mode, not one per line. A 9 → 5N journey is still one
      // Transjakarta mark.
      const key = leg.systemId ?? leg.serviceClass ?? leg.label;
      if (seen.has(key)) continue;
      seen.set(key, {
        color: leg.color,
        label: leg.label,
        serviceClass: leg.serviceClass ?? null,
        systemId: leg.systemId ?? null,
      });
    }
    return [...seen.values()];
  }, [legs]);

  const journey = entries.length > 0;
  const onSystems = NETWORK_SYSTEMS.filter((entry) => !hiddenSystems.has(entry.id)).length;
  const totalLines = Object.values(systemCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <section aria-labelledby="network-filter-label" className="px-3 pb-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="network-filter-label" className="eyebrow">
            Operators
          </h2>
          <p className="font-mono text-[12px] leading-[1.2] tabular-nums text-ink-3">
            {onSystems}/{NETWORK_SYSTEMS.length} on
          </p>
        </div>

        <div role="group" aria-labelledby="network-filter-label" className="mt-2 grid grid-cols-5 gap-2">
          {NETWORK_SYSTEMS.map((entry) => {
            const on = !hiddenSystems.has(entry.id);
            const count = systemCounts[entry.id] ?? 0;
            return (
              <Tooltip
                key={entry.id}
                label={
                  <div>
                    <p className="text-[12px] font-mono uppercase tracking-[0.04em] text-ink-3">
                      {entry.label}
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-ink">
                      {on ? `Hides ${count} lines` : `Shows ${count} lines`}
                    </p>
                  </div>
                }
              >
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={on ? `Hide ${entry.label}` : `Show ${entry.label}`}
                  onClick={() => onToggleSystem(entry.id)}
                  className={cn(
                    "group relative flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md border px-1 py-2 transition-[border-color,background-color,opacity,transform] duration-150 active:translate-y-px",
                    on
                      ? "border-line-strong bg-surface hover:border-ink hover:bg-surface-2"
                      : "border-transparent bg-surface-2/40 opacity-55 hover:opacity-80",
                  )}
                >
                  <span className="flex h-4 w-full items-center justify-center">
                    <OperatorBadge
                      logo={entry.logo}
                      className={cn(
                        "max-h-4 w-auto max-w-full object-contain transition-[filter,transform] duration-200 group-hover:-translate-y-0.5",
                        on ? "" : "grayscale",
                      )}
                    />
                  </span>
                  <span
                    aria-hidden
                    className="h-[2px] w-6 rounded-full transition-opacity"
                    style={{ backgroundColor: entry.color, opacity: on ? 1 : 0.3 }}
                  />
                  <span className="font-mono text-[12px] leading-[1.2] tabular-nums text-ink-3">
                    {count}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>

        <p className="mt-2 text-[12px] leading-[1.45] text-ink-3">
          {networkError
            ? "The network did not load."
            : networkReady
              ? "Tap an operator to hide its routes and stops."
              : "Loading the network."}
        </p>

        {journey ? (
          <div data-testid="this-journey" className="mt-3 border-t border-line/70 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="eyebrow">This journey</h3>
              <p className="font-mono text-[12px] uppercase leading-[1.2] tracking-[0.04em] text-ink-3">
                {entries.length} {entries.length === 1 ? "mode" : "modes"}
              </p>
            </div>
            <ul className="mt-2 flex flex-wrap items-center gap-2">
              {entries.map((entry) => {
                const system = NETWORK_SYSTEMS.find((item) => item.id === entry.systemId);
                const label = system?.label ?? entry.label;
                return (
                  <li
                    key={entry.systemId ?? entry.label}
                    title={label}
                    aria-label={label}
                    className="flex h-8 items-center rounded-[4px] border border-line bg-surface-2 px-2"
                  >
                    {system ? (
                      <OperatorBadge
                        logo={system.logo}
                        className="h-3.5 w-auto max-w-[72px] object-contain object-left"
                      />
                    ) : (
                      <span style={{ color: entry.color }}>
                        <ServiceMark serviceClass={entry.serviceClass} className="size-4" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 border-t border-line/70 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="eyebrow">The network</h3>
            <p className="font-mono text-[12px] leading-[1.2] tabular-nums text-ink-3">
              {totalLines} lines
            </p>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-line/70 bg-surface-2/40 px-2 py-2">
              <dt className="eyebrow">Operators</dt>
              <dd className="mt-0.5 font-mono text-[20px] font-semibold leading-[1.2] tabular-nums text-ink">
                5
              </dd>
            </div>
            <div className="rounded-md border border-line/70 bg-surface-2/40 px-2 py-2">
              <dt className="eyebrow">Lines</dt>
              <dd className="mt-0.5 font-mono text-[20px] font-semibold leading-[1.2] tabular-nums text-ink">
                {totalLines}
              </dd>
            </div>
            <div className="rounded-md border border-line/70 bg-surface-2/40 px-2 py-2">
              <dt className="eyebrow">On</dt>
              <dd className="mt-0.5 font-mono text-[20px] font-semibold leading-[1.2] tabular-nums text-ink">
                {onSystems}/5
              </dd>
            </div>
          </dl>
          <div className="mt-2 rounded-md border border-dashed border-line-strong/70 px-2 py-2">
            <p className="eyebrow">Reading the map</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] leading-[1.2] text-ink-2">
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full bg-mode-bus" />
                Bus band
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full bg-mode-metro" />
                Metro core
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full bg-mode-tram" />
                LRT stitch
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full bg-mode-rail" />
                Rail sleepers
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
