import {
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Network,
  Route,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { IncidentIcon } from "../../components/transit/incident-icon.js";
import { NETWORK_SYSTEMS } from "../../components/map/operator-mark.js";
import { Tooltip } from "../../components/ui/tooltip.js";
import {
  getNoticeEvidence,
  type DisruptionSummary,
  type NoticeDiversion,
  type NoticeEvidence,
  type NoticeSource,
} from "../../lib/api.js";
import { cn } from "../../lib/cn.js";
import { formatDateTime, formatTime } from "../../lib/format.js";


type ActivityEvent = {
  at: string;
  message: string;
  phase: string;
  source: string;
};

/**
 * Stored notices, as a small service board.
 *
 * The order is chronological and the severity is a rail rather than another
 * badge. A notice is never "unplaced": it is about a stop the rider can walk
 * to, a corridor or rail line the rider can ride, or an operator's whole
 * service. The row says which, and only a notice with somewhere to go moves
 * the map.
 */
export function MonitorStatus({
  notices,
  noticesReady,
  noticesError,
  activeId,
  onShow,
  onRetry,
}: {
  notices: readonly DisruptionSummary[];
  noticesReady: boolean;
  noticesError: boolean;
  activeId: string | null;
  onShow: (notice: DisruptionSummary) => void;
  onRetry?: (() => void) | undefined;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/monitor/activity");
    source.onopen = () => setConnected(true);
    source.onmessage = (message) => {
      let event: ActivityEvent;
      try {
        event = JSON.parse(message.data) as ActivityEvent;
      } catch {
        return;
      }
      if (!event.message) return;
      setConnected(true);
      if (
        event.source === "monitor" &&
        (event.phase === "stored" || event.phase === "error" || event.phase === "idle")
      ) {
        setCheckedAt(event.at);
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);


  // "Open" is not the same as "in force now". A future window is still on
  // the board as upcoming, but it must not be counted as a current notice.
  const current = useMemo(() => notices.filter((notice) => notice.activeNow), [notices]);
  const stops = current.filter((notice) => notice.scope === "stop").length;
  const corridors = current.filter((notice) => notice.scope === "line").length;
  const networkWide = current.filter((notice) => notice.scope === "network").length;
  const upcoming = notices.length - current.length;
  const todayKey = jakartaDateKey(new Date().toISOString());
  const groups = splitByServiceDay(current, todayKey);

  return (
    <section aria-label="Service notices" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="border-b border-line/70 px-4 pb-3 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Open now</p>
            <p className="mt-1 text-[28px] font-semibold leading-[1.2] tracking-[-0.03em] tabular-nums text-ink">
              {noticesError ? "-" : noticesReady ? current.length : "·"}
            </p>
          </div>
          <div className="min-w-0 text-right">
            {noticesError ? (
              <p className="text-[12px] leading-[1.45] text-ink-2">
                Stored notices could not be read.
              </p>
            ) : !noticesReady ? (
              <p className="text-[12px] leading-[1.45] text-ink-2">Loading stored notices.</p>
            ) : notices.length === 0 ? (
              <p className="text-[12px] leading-[1.45] text-ink-2">No open notices.</p>
            ) : (
              <p className="text-[12px] leading-[1.45] text-ink-3">
                {[
                  [stops, "at a stop"] as const,
                  [corridors, "on a corridor"] as const,
                  [networkWide, "across a network"] as const,
                ]
                  .filter(([count]) => count > 0)
                  .map(([count, label]) => `${count} ${label}`)
                  .join(" · ")}
              </p>
            )}
            <p className="mt-1 font-mono text-[12px] leading-[1.2] tabular-nums text-ink-3">
              {formatDateTime(new Date().toISOString())} WIB
            </p>
          </div>
        </div>
      </header>

      <div className="scroll-quiet min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {noticesError ? (
          <div className="px-4 py-4">
            <p className="text-[13px] leading-[1.5] text-ink-2">
              The stored notices are unavailable right now.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : !noticesReady ? (
          <NoticeSkeleton />
        ) : current.length === 0 ? (
          <EmptyBoard upcoming={upcoming} />
        ) : (
          <div className="min-w-0">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label} className="min-w-0">
                <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-line/60 bg-surface/95 px-4 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3 backdrop-blur">
                  <span>{group.label}</span>
                  <span className="font-mono text-[12px] font-normal tabular-nums text-ink-3">
                    {group.notices.length}
                  </span>
                </h3>
                <ul className="min-w-0 divide-y divide-line/60">
                  {group.notices.map((notice) => (
                    <NoticeRow
                      key={notice.id}
                      notice={notice}
                      todayKey={todayKey}
                      selected={notice.id === activeId}
                      expanded={expandedId === notice.id}
                      onToggle={() => {
                        const next = expandedId === notice.id ? null : notice.id;
                        setExpandedId(next);
                        if (next) onShow(notice);
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line/70 px-4 py-2">
        <p
          className="font-mono text-[12px] leading-[1.2] text-ink-3"
          aria-live="polite"
        >
          Last check:{" "}
          {checkedAt ? (
            <time dateTime={checkedAt}>{formatCheckTime(checkedAt)}</time>
          ) : connected ? (
            "waiting for the first check"
          ) : (
            "not connected"
          )}
        </p>
      </footer>
    </section>
  );
}

function NoticeDetail({ notice }: { notice: DisruptionSummary }) {
  const [evidence, setEvidence] = useState<NoticeEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getNoticeEvidence(notice.id)
      .then((result) => {
        if (!controller.signal.aborted) setEvidence(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [notice.id]);

  const sources = evidence?.sources ?? [];
  return (
    <div
      id={`notice-detail-${notice.id}`}
      className="min-w-0 border-t border-line/80 bg-surface-2/45 px-4 py-3"
    >
      <p className="break-words text-[13px] leading-[1.5] text-ink-2">{notice.body}</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[12px] leading-[1.45] text-ink-3">
        <span>
          {notice.sourceType === "social"
            ? "Operator post"
            : notice.sourceType === "news"
              ? "News"
              : "Official source"}
        </span>
        <span>{scopeLabel(notice)}</span>
        {notice.viaToll ? <span>Diverted via toll</span> : null}
      </div>

      {verificationDetail(notice) ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-ink-3">
          {verificationDetail(notice)}
        </p>
      ) : null}

      {notice.diversions && notice.diversions.length > 0 ? (
        <div className="mt-3 space-y-3">
          {notice.diversions.map((diversion) => (
            <NoticeDiversionBlock key={`${diversion.lineId}:${diversion.direction}`} diversion={diversion} />
          ))}
        </div>
      ) : notice.diversionDescription ? (
        <NoticeDiversionDescription description={notice.diversionDescription} />
      ) : null}

      <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Original source
      </h3>
      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
          <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
          Loading the stored source.
        </p>
      ) : failed ? (
        <p className="mt-2 text-[13px] leading-[1.5] text-ink-2">
          The stored source could not be read.
        </p>
      ) : sources.length === 0 ? (
        <p className="mt-2 text-[13px] leading-[1.5] text-ink-2">
          No post body is stored for this notice.
          {notice.url ? " The original link is still available." : ""}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sources.map((source) => (
            <SourceCard key={`${source.type}:${source.url}`} source={source} />
          ))}
        </ul>
      )}

      {notice.url ? (
        <a
          href={notice.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover"
        >
          Open the stored notice
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function NoticeDiversionDescription({
  description,
}: {
  description: NonNullable<DisruptionSummary["diversionDescription"]>;
}) {
  const path = [description.from, ...description.via, description.to].filter(
    (value): value is string => Boolean(value),
  );
  return (
    <section className="mt-3 rounded-[10px] border border-line bg-surface-2/40 p-3" aria-label="Diverted route">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Diverted route
      </h3>
      <p className="mt-1 text-[13px] leading-[1.45] text-ink-2">
        {path.length > 0 ? path.join(" → ") : "The announcement names a diversion."}
        {description.follows.length > 0 ? ` · follows ${description.follows.join(" / ")}` : ""}
      </p>
      <p className="mt-1 text-[12px] leading-[1.45] text-ink-3">
        The announcement names these places; the exact road path is not verified yet.
      </p>
    </section>
  );
}

function NoticeDiversionBlock({ diversion }: { diversion: NoticeDiversion }) {
  const via = diversion.via.slice(0, 9);
  return (
    <section className="rounded-[10px] border border-line bg-surface-2/40 p-3" aria-label="Diverted route">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Diverted route
      </h3>
      <p className="mt-1 text-[13px] leading-[1.45] text-ink-2">
        {diversion.viaLineCodes.length > 0
          ? `Follows ${diversion.viaLineCodes.join(" / ")} alignment`
          : "Borrowed road"}
        {diversion.approximate ? " · approximate path" : ""}
      </p>
      {via.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {via.map((point) => (
            <li key={point.stationId} className="flex items-start gap-2 text-[12px] leading-[1.45]">
              <span
                aria-hidden
                className="mt-1 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: point.served ? "var(--accent)" : "var(--line-strong)" }}
              />
              <span className={point.served ? "text-ink" : "text-ink-2"}>{point.name}</span>
              <span className="ml-auto shrink-0 text-[12px] text-ink-3">
                {point.served ? "served" : "alignment"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {diversion.skippedNames.length > 0 ? (
        <p className="mt-2 text-[12px] leading-[1.45] text-danger">
          Not served: {diversion.skippedNames.join(" · ")}
        </p>
      ) : null}
      {diversion.quote ? (
        <p className="mt-2 border-l-2 border-line-strong pl-2 text-[12px] leading-[1.45] text-ink-3">
          “{diversion.quote}”
        </p>
      ) : null}
      {diversion.sourceUrl ? (
        <a
          href={diversion.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
        >
          Operator source
          <ExternalLink aria-hidden className="size-3" />
        </a>
      ) : null}
    </section>
  );
}

function SourceCard({ source }: { source: NoticeSource }) {
  const label =
    source.type === "x"
      ? source.authorHandle
        ? `@${source.authorHandle}`
        : "Original post"
      : source.type === "news"
        ? (source.title ?? "News source")
        : "Source";
  return (
    <li className="rounded-[10px] border border-line bg-surface-2/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{label}</span>
        {source.publishedAt ? (
          <time className="shrink-0 font-mono text-[12px] tabular-nums text-ink-3" dateTime={source.publishedAt}>
            {formatTime(source.publishedAt)} WIB
          </time>
        ) : null}
      </div>
      {source.text ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-ink">
          {source.text}
        </p>
      ) : (
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">
          Only the link is stored. Open it to read the full source.
        </p>
      )}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
      >
        {source.type === "x" ? "Open on X" : source.type === "news" ? "Open article" : "Open source"}
        <ExternalLink aria-hidden className="size-3" />
      </a>
    </li>
  );
}

/** The WIB calendar day of a notice, used for the service-night grouping. */
function jakartaDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** A notice that started before today is still here because it is in force. */
function splitByServiceDay(
  notices: readonly DisruptionSummary[],
  todayKey: string,
): { key: string; label: string; notices: DisruptionSummary[] }[] {
  const carried: DisruptionSummary[] = [];
  const today: DisruptionSummary[] = [];
  for (const notice of notices) {
    const start = notice.startsAt ?? notice.publishedAt;
    (jakartaDateKey(start) === todayKey ? today : carried).push(notice);
  }
  // Newest first inside each group, and Today before the overnight carry-over.
  const newestFirst = (left: DisruptionSummary, right: DisruptionSummary): number =>
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  today.sort(newestFirst);
  carried.sort(newestFirst);
  return [
    ...(today.length > 0 ? [{ key: "today", label: "Today", notices: today }] : []),
    ...(carried.length > 0
      ? [{ key: "carried", label: "Overnight · carried over", notices: carried }]
      : []),
  ];
}

/** Why the row is still on the live board. */
function activeReason(notice: DisruptionSummary, todayKey: string): string | null {
  if (notice.endsAt) return `Ends ${rowTime(notice.endsAt, todayKey)}`;
  if (notice.validityWindows && notice.validityWindows.length > 0) {
    return "Scheduled window";
  }
  // A reviewed notice says when it was checked in the freshness line below;
  // the old "no reopening" line would repeat the same idea.
  if (notice.reviewState || notice.reviewAt || notice.lastVerifiedAt) return null;
  const confirmed = notice.lastSeenAt ?? notice.publishedAt;
  return `No reopening yet · ${rowTime(confirmed, todayKey)}`;
}

/**
 * A plain-language line about how fresh the notice is.
 *
 * "Unverified" is an internal review state; the rider sees what it means:
 * we have not found a newer update yet, and when we will look again.
 */
function verificationCopy(notice: DisruptionSummary, todayKey: string): string | null {
  const checked = notice.lastVerifiedAt
    ? rowTime(notice.lastVerifiedAt, todayKey)
    : null;
  const next = notice.reviewAt ? rowTime(notice.reviewAt, todayKey) : null;
  if (notice.reviewState === "unverified") {
    return next
      ? `No fresh update yet. Next check ${next}.`
      : "No fresh update yet. Next check soon.";
  }
  if (checked && next) return `Checked ${checked}. Next check ${next}.`;
  if (checked) return `Checked ${checked}.`;
  if (next) return `Next check ${next}.`;
  return null;
}

/** The longer explanation inside the opened notice. */
function verificationDetail(notice: DisruptionSummary): string | null {
  const checked = notice.lastVerifiedAt
    ? formatDateTime(notice.lastVerifiedAt)
    : null;
  const next = notice.reviewAt ? formatDateTime(notice.reviewAt) : null;
  if (notice.reviewState === "unverified") {
    return `We haven’t found a newer update yet. The notice stays visible until we can confirm the service is back.${
      checked ? ` Last checked ${checked} WIB.` : ""
    }${next ? ` We’ll check again ${next} WIB.` : ""}`;
  }
  if (checked && next) {
    return `Last checked ${checked} WIB. We’ll look for an update again ${next} WIB.`;
  }
  if (checked) return `Last checked ${checked} WIB.`;
  if (next) return `We’ll look for an update again ${next} WIB.`;
  return null;
}

/** A date on a carried-over row; today's rows stay compact. */
function rowTime(iso: string, todayKey: string): string {
  return jakartaDateKey(iso) === todayKey
    ? `${formatTime(iso)} WIB`
    : `${formatDateTime(iso)} WIB`;
}

function NoticeRow({
  notice,
  todayKey,
  selected,
  expanded,
  onToggle,
}: {
  notice: DisruptionSummary;
  todayKey: string;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const severity = severityOf(notice.severity);
  const codeList = allLineCodes(notice);
  const codes = codeList.slice(0, 3).join(" · ");
  const freshness = verificationCopy(notice, todayKey);
  const body = (
    <div className="group flex min-w-0 items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[6px] border transition-transform duration-200 group-hover:-translate-y-0.5"
        style={{
          backgroundColor: severity.soft,
          color: severity.color,
          borderColor: `color-mix(in oklab, ${severity.color} 30%, transparent)`,
        }}
      >
        <IncidentIcon mark={notice.mark} kind={notice.kind} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2 font-mono text-[12px] leading-[1.2] text-ink-3">
          <time className="shrink-0 tabular-nums" dateTime={notice.publishedAt}>
            {rowTime(notice.publishedAt, todayKey)}
          </time>
          <span aria-hidden className="shrink-0">·</span>
          <span className="min-w-0 truncate uppercase tracking-[0.04em]">
            {kindLabel(notice.kind)}
          </span>
          {codeList.length > 0 ? (
            <Tooltip
              variant="panel"
              side="left"
              className="w-[260px]"
              label={
                <div>
                  <p className="eyebrow">Affected lines</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {codeList.map((code) => (
                      <span
                        key={code}
                        className="rounded-[4px] border border-line-strong px-2 py-1 font-mono text-[12px] leading-[1.2] text-ink-2"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] leading-[1.45] text-ink-3">
                    {scopeLabel(notice)}
                  </p>
                </div>
              }
            >
              <span
                tabIndex={0}
                onClick={(event) => event.stopPropagation()}
                className="ml-auto max-w-[42%] shrink-0 cursor-help truncate rounded-[4px] border border-line-strong px-2 text-[12px] tracking-[0.01em] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {codes}
                {codeList.length > 3 ? (
                  <span className="ml-1 text-ink-3">+{codeList.length - 3}</span>
                ) : null}
              </span>
            </Tooltip>
          ) : null}
        </span>
        <span className="mt-2 block break-words text-[13px] font-semibold leading-[1.45] text-ink line-clamp-2">
          {notice.title}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[12px] leading-[1.45] text-ink-3">
          <ScopeIcon scope={notice.scope} />
          <span className="min-w-0 flex-1 truncate">{scopeLabel(notice)}</span>
          {whenLabel(notice) ? (
            <>
              <span aria-hidden className="shrink-0">·</span>
              <span className="max-w-[45%] shrink-0 truncate text-right">
                {whenLabel(notice)}
              </span>
            </>
          ) : null}
        </span>
        <span className="sr-only">{severity.label} notice</span>
        {activeReason(notice, todayKey) ? (
          <span
            className="mt-1 block truncate font-mono text-[12px] leading-[1.2] text-ink-3"
            title={activeReason(notice, todayKey) ?? undefined}
          >
            {activeReason(notice, todayKey)}
          </span>
        ) : null}
        {freshness ? (
          <span
            className="mt-0.5 block truncate text-[12px] leading-[1.45] text-ink-3"
            title={freshness}
          >
            {freshness}
          </span>
        ) : null}
      </span>
      {/* The first line is the corridor chip; keep the chevron centred on it. */}
      <ChevronRight
        aria-hidden
        className={cn(
          "mt-0 size-4 shrink-0 text-ink-3 transition-transform duration-200 ease-out motion-reduce:transition-none",
          expanded && "rotate-90",
        )}
      />
    </div>
  );

  return (
    <li
      className="min-w-0 border-l-[3px] transition-colors"
      style={{ borderLeftColor: severity.color }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`notice-detail-${notice.id}`}
        aria-label={`${notice.title}. ${scopeLabel(notice)}. ${severity.label}.${freshness ? ` ${freshness}` : ""}`}
        className={cn(
          "flex w-full min-w-0 cursor-pointer text-left transition-colors hover:bg-surface-2 active:translate-y-px",
          selected && "bg-warn-soft/70",
          expanded && "bg-surface-2",
        )}
      >
        {body}
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="notice-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="overflow-hidden"
          >
            <NoticeDetail notice={notice} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function ScopeIcon({ scope }: { scope: DisruptionSummary["scope"] }) {
  if (scope === "stop") return <MapPin aria-hidden className="size-3 shrink-0" />;
  if (scope === "line") return <Route aria-hidden className="size-3 shrink-0" />;
  return <Network aria-hidden className="size-3 shrink-0" />;
}

/** The stop, corridor or operator the notice is about, as a rider reads it. */
function scopeLabel(notice: DisruptionSummary): string {
  if (notice.scope === "stop") {
    const names = notice.stations.map((station) => station.name);
    if (names.length === 0) return notice.stationName ?? "A stop";
    if (names.length === 1) return names[0] ?? "A stop";
    return `${names[0]} +${names.length - 1}`;
  }
  if (notice.scope === "line") {
    const road = notice.roads[0];
    const near = road ? ` near ${road.name}` : "";
    if (notice.lines.length > 0) {
      const first = notice.lines[0];
      const label = first ? lineLabel(first) : "Corridor";
      return notice.lines.length > 1
        ? `${label} +${notice.lines.length - 1}${near}`
        : `${label}${near}`;
    }
    const code = notice.lineCodes[0];
    return code ? `Corridor ${code}${near}` : "A corridor";
  }
  const system = NETWORK_SYSTEMS.find((entry) => entry.id === notice.systemId);
  return system ? system.label : "The network";
}

/** The time a notice is in force, kept short enough for one line. */
function whenLabel(notice: DisruptionSummary): string | null {
  const window = windowLabel(notice);
  if (window) return window;
  return notice.endsAt ? `until ${formatTime(notice.endsAt)} WIB` : null;
}

/** A Transjakarta corridor is a corridor; the railways run lines. */
function lineLabel(line: { code: string; systemId: string }): string {
  return line.systemId === "transjakarta" ? `Corridor ${line.code}` : `Line ${line.code}`;
}

function NoticeSkeleton() {
  return (
    <div className="divide-y divide-line/60" aria-hidden>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 size-8 shrink-0 rounded-[6px] bg-surface-2" />
          <span className="min-w-0 flex-1">
            <span className="block h-3 w-24 rounded-[4px] bg-surface-2" />
            <span className="mt-2 block h-3 w-full rounded-[4px] bg-surface-2" />
            <span className="mt-2 block h-3 w-2/3 rounded-[4px] bg-surface-2" />
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyBoard({ upcoming }: { upcoming: number }) {
  return (
    <div className="px-4 py-6">
      <div aria-hidden className="flex items-center gap-2">
        <span className="size-2 rounded-full border-2 border-accent bg-surface" />
        <span className="h-px flex-1 bg-line-strong/60" />
        <span className="size-2 rounded-[4px] bg-ink" />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-ink">No notice is in force right now.</p>
      <p className="mt-1 text-[12px] leading-[1.5] text-ink-3">
        {upcoming > 0
          ? `${upcoming} upcoming ${upcoming === 1 ? "notice starts" : "notices start"} later. The board will show it when its window opens.`
          : "The monitor is listening to the operators."}
      </p>
    </div>
  );
}

function severityOf(severity: string): { color: string; soft: string; label: string } {
  if (severity === "critical" || severity === "severe") {
    return { color: "var(--danger)", soft: "var(--danger-soft)", label: "Serious" };
  }
  if (severity === "warning") {
    return { color: "var(--warn)", soft: "var(--warn-soft)", label: "Warning" };
  }
  return { color: "var(--info)", soft: "var(--info-soft)", label: "Information" };
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "diversion":
      return "Diversion";
    case "closure":
      return "Closure";
    case "delay":
      return "Delay";
    case "service-change":
      return "Service change";
    case "maintenance":
      return "Maintenance";
    case "strike":
      return "Strike";
    case "weather":
      return "Weather";
    default:
      return "Notice";
  }
}

/** Every line code the notice names, written the way the operator prints them. */
function allLineCodes(notice: DisruptionSummary): string[] {
  const codes = [
    ...notice.lineCodes,
    ...notice.lines.map((line) => line.code),
  ];
  return [...new Set(codes.map((code) => code.trim()).filter((code) => code.length > 0))];
}

/**
 * The next impact window, stated as a rider reads it.
 *
 * A notice can be relevant now, later today, or on another day. It must say
 * which one; "until 25 October" is not an impact window.
 */
function windowLabel(notice: DisruptionSummary): string | null {
  const windows = notice.validityWindows;
  if (!windows || windows.length === 0) return null;
  const now = Date.now();
  const current = windows.find((window) => {
    const start = Date.parse(window.startsAt);
    const end = window.endsAt ? Date.parse(window.endsAt) : Number.POSITIVE_INFINITY;
    return start <= now && end > now;
  });
  if (current) {
    return current.endsAt ? `until ${formatTime(current.endsAt)} WIB` : "active";
  }
  const next = windows
    .filter((window) => Date.parse(window.startsAt) > now)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0];
  if (!next) return "ended";
  const start = formatTime(next.startsAt);
  const end = next.endsAt ? `-${formatTime(next.endsAt)}` : "";
  return `next ${formatDay(next.startsAt)} ${start}${end} WIB`;
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "later";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/**
 * The last check, in the rider's clock.
 *
 * "24 Oct 2026 10:56:30" is unambiguous in a log line: the date is not a
 * relative phrase that decays while the page is open.
 */
function formatCheckTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(date)
    .replace(",", "");
}
