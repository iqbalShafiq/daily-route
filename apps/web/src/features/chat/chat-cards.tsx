import { Clock3, ExternalLink, MapPin, Navigation, TriangleAlert } from "lucide-react";

import { Button } from "../../components/ui/button.js";
import { Headsign } from "../../components/ui/headsign.js";
import { cn } from "../../lib/cn.js";
import { SERVICE_CLASS_COLOR, type ServiceClass } from "../../lib/format.js";
import type { ChatCard } from "@daily-route/transit";

import type { ChatAction } from "./use-chat.js";

/**
 * The semantic part of an assistant answer.
 *
 * A route card is built from the planner's tool result, a stop card from
 * the station lookup, and a notice card from the stored notice. The model's
 * prose sits above or below these cards; it cannot create one.
 */
export function ChatCards({
  cards,
  actions,
  onAction,
}: {
  cards: readonly ChatCard[];
  actions: readonly ChatAction[];
  onAction: (action: ChatAction) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {cards.map((card, index) => (
        <ChatCardView
          key={`${card.type}-${index}`}
          card={card}
          actions={actions}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function ChatCardView({
  card,
  actions,
  onAction,
}: {
  card: ChatCard;
  actions: readonly ChatAction[];
  onAction: (action: ChatAction) => void;
}) {
  if (card.type === "route") {
    const routeAction =
      actions.find((action) => action.type === "show_route") ??
      ({
        key: `route:${card.origin}:${card.destination}`,
        type: "show_route",
        label: "Open this journey",
        origin: card.origin,
        destination: card.destination,
      } satisfies ChatAction);
    const firstRide = card.primary.legs.find((leg) => leg.kind === "ride");
    const rideColor = firstRide
      ? (SERVICE_CLASS_COLOR[firstRide.serviceClass as ServiceClass] ?? "var(--mode-bus)")
      : null;
    return (
      <article className="overflow-hidden rounded-[4px] border border-line">
        {/* A route answer is the same headsign as the planner's result,
            not a second card style. */}
        <Headsign
          code={firstRide?.lineCode ?? null}
          codeColor={rideColor}
          destination={card.destination}
          closed={card.status === "terhalang"}
          meta={
            <>
              <span>{Math.round(card.primary.durationMinutes)} min</span>
              <span aria-hidden>·</span>
              <span>
                {card.primary.transfers > 0
                  ? `${card.primary.transfers} change${card.primary.transfers === 1 ? "" : "s"}`
                  : "no changes"}
              </span>
              {card.primary.fareLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Fare</span>
                  <span>{card.primary.fareLabel}</span>
                </>
              ) : null}
            </>
          }
        />
        <div aria-hidden className="ticket-perforation" />

        <div className="px-3 py-2">
          <p className="text-[12px] leading-[1.45] text-ink-3">
            From {card.origin} to {card.destination}
            {card.primary.walkingKm > 0
              ? ` · walk ${card.primary.walkingKm.toFixed(1)} km`
              : ""}
          </p>
          <ul className="mt-2 space-y-2">
            {card.primary.legs.slice(0, 6).map((leg, index) => (
              <li key={`${leg.from}-${leg.to}-${index}`} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-9 shrink-0 rounded-[3px] px-1 py-px text-center text-[12px] font-semibold tabular-nums",
                    leg.kind === "walk"
                      ? "bg-surface-2 text-ink-3"
                      : "bg-surface-2 text-ink",
                  )}
                  style={
                    leg.kind === "walk"
                      ? undefined
                      : { color: SERVICE_CLASS_COLOR[leg.serviceClass as ServiceClass] }
                  }
                >
                  {leg.kind === "walk" ? "walk" : (leg.lineCode ?? "ride")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-ink-2">
                  {leg.from} → {leg.to}
                </span>
                {leg.kind === "ride" ? <FrequencyBadge leg={leg} /> : null}
                <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
                  {Math.round(leg.durationMinutes)} min
                </span>
              </li>
            ))}
          </ul>
        </div>

        {card.notices.length > 0 ? (
          <div className="bg-warn-soft px-3 py-2">
            {card.notices.slice(0, 2).map((notice) => {
              const noticeAction = actions.find(
                (action) => action.type === "show_notice" && action.disruptionId === notice.id,
              );
              return (
                <div key={notice.id} className="flex items-start gap-2 py-0.5 text-[12px] leading-[1.45] text-ink-2">
                  <TriangleAlert aria-hidden className="mt-px size-3 shrink-0 text-warn" />
                  <span className="min-w-0 flex-1">{notice.title}</span>
                  {noticeAction ? (
                    <button
                      type="button"
                      onClick={() => onAction(noticeAction)}
                      className="shrink-0 cursor-pointer text-[12px] text-ink underline underline-offset-2 hover:text-ink-2"
                    >
                      Show
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {card.alternatives.length > 0 ? (
          <div className="px-3 py-2">
            <p className="text-[12px] leading-[1.45] text-ink-3">Other ways</p>
            <ul className="mt-1 space-y-0.5">
              {card.alternatives.map((option, index) => (
                <li key={index} className="flex items-baseline gap-2 text-[12px] text-ink-2">
                  <span className="min-w-0 flex-1 truncate">
                    {option.legs
                      .filter((leg) => leg.kind === "ride")
                      .map((leg) => leg.lineCode)
                      .filter(Boolean)
                      .join(" · ") || "Route"}
                  </span>
                  <span className="tabular-nums">{option.durationMinutes} min</span>
                  {option.fareLabel ? <span className="tabular-nums">{option.fareLabel}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {routeAction ? (
          <div className="px-3 py-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onAction(routeAction)}>
              Open this journey
            </Button>
          </div>
        ) : null}
      </article>
    );
  }

  if (card.type === "stop") {
    const show =
      actions.find(
        (action) => action.type === "show_stop" && action.stationId === card.stationId,
      ) ??
      ({
        key: `stop:${card.stationId}`,
        type: "show_stop",
        label: `Show ${card.name}`,
        stationId: card.stationId,
        name: card.name,
        latitude: card.latitude,
        longitude: card.longitude,
      } satisfies ChatAction);
    const origin =
      actions.find(
        (action) => action.type === "set_origin" && action.stationId === card.stationId,
      ) ??
      ({
        key: `origin:${card.stationId}`,
        type: "set_origin",
        label: `Use ${card.name} as the origin`,
        stationId: card.stationId,
        name: card.name,
        latitude: card.latitude,
        longitude: card.longitude,
      } satisfies ChatAction);
    const destination =
      actions.find(
        (action) => action.type === "set_destination" && action.stationId === card.stationId,
      ) ??
      ({
        key: `destination:${card.stationId}`,
        type: "set_destination",
        label: `Use ${card.name} as the destination`,
        stationId: card.stationId,
        name: card.name,
        latitude: card.latitude,
        longitude: card.longitude,
      } satisfies ChatAction);
    return (
      <article className="rounded-[4px] border border-line bg-surface px-3 py-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold leading-[1.35] text-ink-3">
          <MapPin aria-hidden className="size-3" />
          Stop
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-ink">{card.name}</p>
        {card.area ? <p className="text-[12px] text-ink-3">{card.area}</p> : null}
        {card.lines.length > 0 ? (
          <p className="mt-2 flex flex-wrap gap-1">
            {card.lines.slice(0, 8).map((line) => (
              <span key={line.code} className="rounded-[3px] bg-surface-2 px-2 py-px text-[12px] font-semibold text-ink-2">
                {line.code}
              </span>
            ))}
          </p>
        ) : null}
        {card.departures.length > 0 ? (
          <div className="mt-2">
            <p className="flex items-center gap-1 text-[12px] text-ink-3">
              <Clock3 aria-hidden className="size-3" />
              Scheduled departures
            </p>
            <ul className="mt-1 space-y-0.5">
              {card.departures.slice(0, 5).map((row, index) => (
                <li key={`${row.code}-${row.direction}-${index}`} className="flex items-baseline gap-2 text-[12px] text-ink-2">
                  <span className="w-9 shrink-0 font-semibold text-ink-3">{row.code}</span>
                  <span className="min-w-0 flex-1 truncate">{row.headsign ?? "Towards the end"}</span>
                  <span className="shrink-0 tabular-nums text-ink-3">
                    {row.headwayMinMinutes === null ? "unknown" : `~${Math.round(row.headwayMinMinutes)} min`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {show ? <ActionButton action={show} onAction={onAction} /> : null}
          {origin ? <ActionButton action={origin} onAction={onAction} /> : null}
          {destination ? <ActionButton action={destination} onAction={onAction} /> : null}
        </div>
      </article>
    );
  }

  if (card.type === "notice") {
    const show =
      actions.find(
        (action) => action.type === "show_notice" && action.disruptionId === card.id,
      ) ??
      (card.latitude !== null && card.longitude !== null
        ? ({
            key: `notice:${card.id}`,
            type: "show_notice",
            label: "Show on map",
            disruptionId: card.id,
            latitude: card.latitude,
            longitude: card.longitude,
          } satisfies ChatAction)
        : undefined);
    const source =
      actions.find((action) => action.type === "open_source" && action.url === card.url) ??
      (card.url
        ? ({
            key: `source:${card.url}`,
            type: "open_source",
            label: "Read the source",
            url: card.url,
          } satisfies ChatAction)
        : undefined);
    return (
      <article className="rounded-[4px] border border-line bg-surface px-3 py-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold leading-[1.35] text-warn">
          <TriangleAlert aria-hidden className="size-3" />
          {card.kind} · {card.scope}
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-ink">{card.title}</p>
        {card.affects ? <p className="mt-0.5 text-[12px] text-ink-3">{card.affects}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {show ? <ActionButton action={show} onAction={onAction} /> : null}
          {source ? <ActionButton action={source} onAction={onAction} /> : null}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[4px] border border-line bg-surface px-3 py-2">
      <a
        href={card.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-[12px] text-ink underline underline-offset-2 hover:text-ink-2"
      >
        <ExternalLink aria-hidden className="size-3" />
        <span className="min-w-0 truncate">{card.title}</span>
      </a>
    </article>
  );
}

function FrequencyBadge({ leg }: { leg: { serviceLabel: string | null; headwayMinMinutes: number | null; headwayMaxMinutes: number | null; outsideService: boolean; serviceDetail: string | null } }) {
  if (leg.outsideService) {
    return <span className="shrink-0 text-[12px] text-danger">no service</span>;
  }
  if (leg.headwayMinMinutes === null) return null;
  const min = Math.round(leg.headwayMinMinutes);
  const max = leg.headwayMaxMinutes === null ? min : Math.round(leg.headwayMaxMinutes);
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-ink-3" title={[leg.serviceLabel, leg.serviceDetail].filter(Boolean).join(" · ") || undefined}>
      <Clock3 aria-hidden className="size-3" />
      {min === max ? `~${min}m` : `${min}-${max}m`}
    </span>
  );
}

function ActionButton({
  action,
  onAction,
}: {
  action: ChatAction;
  onAction: (action: ChatAction) => void;
}) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => onAction(action)}>
      {action.type === "set_origin" ? (
        <Navigation aria-hidden className="size-3" />
      ) : null}
      {action.label}
    </Button>
  );
}
