import { ArrowRight, Clock3, ExternalLink, MapPin, Navigation, TriangleAlert } from "lucide-react";

import {
  M3Button,
  M3Card,
  M3ModeBadge,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
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
  onOpenNotice,
}: {
  cards: readonly ChatCard[];
  actions: readonly ChatAction[];
  onAction: (action: ChatAction) => void;
  onOpenNotice?: (noticeId: string) => void;
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
          onOpenNotice={onOpenNotice}
        />
      ))}
    </div>
  );
}

function routeActionOf(
  card: Extract<ChatCard, { type: "route" }>,
  actions: readonly ChatAction[],
): ChatAction {
  return (
    actions.find((action) => action.type === "show_route") ?? {
      key: `route:${card.origin}:${card.destination}`,
      type: "show_route",
      label: "Buka perjalanan ini",
      origin: card.origin,
      destination: card.destination,
    }
  );
}

function uniqueRides(card: Extract<ChatCard, { type: "route" }>) {
  const seen = new Set<string>();
  return card.primary.legs.filter((leg) => {
    if (leg.kind !== "ride") return false;
    const key = `${leg.serviceClass}:${leg.lineCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ChatCardView({
  card,
  actions,
  onAction,
  onOpenNotice,
}: {
  card: ChatCard;
  actions: readonly ChatAction[];
  onAction: (action: ChatAction) => void;
  onOpenNotice?: ((noticeId: string) => void) | undefined;
}) {
  if (card.type === "route") {
    const routeAction = routeActionOf(card, actions);
    const rides = uniqueRides(card);
    return (
      <M3Card
        variant={card.status === "terhalang" ? "error-container" : "primary-container"}
        radius="xl"
        className="grid gap-3 p-4"
      >
        <div className="flex flex-wrap items-center gap-1">
          {rides.length > 0 ? (
            rides.map((leg) => (
              <M3ModeBadge
                key={`${leg.lineCode}-${leg.serviceClass}`}
                serviceClass={leg.serviceClass}
                lineCode={leg.lineCode}
                label={leg.lineCode ?? "Transit"}
              />
            ))
          ) : (
            <M3ModeBadge mode="walk" label="Jalan" />
          )}
        </div>

        <div className="grid gap-1">
          <p className="m3-bs flex min-w-0 items-center gap-1">
            <span className="truncate">{card.origin}</span>
            <ArrowRight aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{card.destination}</span>
          </p>
          <p className="m3-hs m3-em m3-num">
            {Math.round(card.primary.durationMinutes)} mnt
            {card.primary.fareLabel ? (
              <span className="m3-bs m3-em ml-2">· {card.primary.fareLabel}</span>
            ) : null}
          </p>
          <p className="m3-bs">
            {card.primary.transfers > 0
              ? `${card.primary.transfers} kali transit`
              : "Tanpa transit"}
            {card.primary.walkingKm > 0
              ? ` · ${card.primary.walkingKm.toFixed(1)} km jalan`
              : ""}
          </p>
        </div>

        <ul className="grid gap-1">
          {card.primary.legs.slice(0, 6).map((leg, index) => (
            <li
              key={`${leg.from}-${leg.to}-${index}`}
              className="flex items-center gap-2 text-[13px] leading-[1.45]"
            >
              <span
                className={cn(
                  "w-10 shrink-0 rounded-m3-sm px-1 py-0.5 text-center font-mono text-[12px] font-semibold",
                  leg.kind === "walk"
                    ? "bg-m3-surface-lowest/40"
                    : "bg-m3-surface-lowest/60",
                )}
              >
                {leg.kind === "walk" ? "Jalan" : (leg.lineCode ?? "Ride")}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {leg.from} ke {leg.to}
              </span>
              <span className="m3-num shrink-0 text-[12px]">
                {Math.round(leg.durationMinutes)} mnt
              </span>
            </li>
          ))}
        </ul>

        {card.notices.length > 0 ? (
          <div className="grid gap-1 rounded-m3-lg bg-m3-error-container p-3 text-m3-on-error-container">
            {card.notices.slice(0, 2).map((notice) => {
              const action = actions.find(
                (entry) => entry.type === "show_notice" && entry.disruptionId === notice.id,
              );
              return (
                <div key={notice.id} className="flex items-start gap-2 text-[12px] leading-[1.45]">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  <span className="min-w-0 flex-1">{notice.title}</span>
                  {action ? (
                    <button
                      type="button"
                      onClick={() => onAction(action)}
                      className="shrink-0 cursor-pointer underline underline-offset-2"
                    >
                      Peta
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {card.alternatives.length > 0 ? (
          <div className="grid gap-1">
            <p className="m3-lm uppercase">Pilihan lain</p>
            {card.alternatives.slice(0, 2).map((option, index) => (
              <p key={index} className="m3-bs flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {option.legs
                    .filter((leg) => leg.kind === "ride")
                    .map((leg) => leg.lineCode)
                    .filter(Boolean)
                    .join(" · ") || "Perjalanan"}
                </span>
                <span className="m3-num">{option.durationMinutes} mnt</span>
                {option.fareLabel ? <span className="m3-num">{option.fareLabel}</span> : null}
              </p>
            ))}
          </div>
        ) : null}

        <M3Button
          variant={card.status === "terhalang" ? "tonal" : "filled"}
          icon={<ArrowRight aria-hidden />}
          onClick={() => onAction(routeAction)}
        >
          Pakai rute ini
        </M3Button>
      </M3Card>
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
        label: `Lihat ${card.name} di peta`,
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
        label: `Dari ${card.name}`,
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
        label: `Ke ${card.name}`,
        stationId: card.stationId,
        name: card.name,
        latitude: card.latitude,
        longitude: card.longitude,
      } satisfies ChatAction);
    return (
      <M3Card variant="filled" radius="xl" className="grid gap-2 p-4">
        <p className="m3-lm uppercase flex items-center gap-2">
          <MapPin aria-hidden className="size-4" />
          {card.area ? `Halte · ${card.area}` : "Halte"}
        </p>
        <p className="m3-tm">{card.name}</p>
        {card.lines.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {card.lines.slice(0, 8).map((line) => (
              <M3ModeBadge
                key={line.code}
                serviceClass={line.serviceClass}
                lineCode={line.code}
                label={line.code}
              />
            ))}
          </div>
        ) : null}
        {card.departures.length > 0 ? (
          <div className="grid gap-1">
            <p className="m3-bs flex items-center gap-1">
              <Clock3 aria-hidden className="size-3" />
              Berdasarkan jadwal, bukan kedatangan live
            </p>
            {card.departures.slice(0, 5).map((row, index) => (
              <p
                key={`${row.code}-${row.direction}-${index}`}
                className="m3-bs flex items-baseline gap-2"
              >
                <span className="w-10 shrink-0 font-mono">{row.code}</span>
                <span className="min-w-0 flex-1 truncate">{row.headsign ?? "Ujung jalur"}</span>
                <span className="m3-num shrink-0">
                  {row.headwayMinMinutes === null
                    ? "Jadwal"
                    : `~${Math.round(row.headwayMinMinutes)} mnt`}
                </span>
              </p>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <M3Button size="xs" variant="filled" icon={<MapPin aria-hidden />} onClick={() => onAction(show)}>
            Lihat di peta
          </M3Button>
          <M3Button size="xs" variant="tonal" icon={<Navigation aria-hidden />} onClick={() => onAction(origin)}>
            Dari sini
          </M3Button>
          <M3Button size="xs" variant="tonal" icon={<ArrowRight aria-hidden />} onClick={() => onAction(destination)}>
            Ke sini
          </M3Button>
        </div>
      </M3Card>
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
            label: "Lihat di peta",
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
            label: "Sumber",
            url: card.url,
          } satisfies ChatAction)
        : undefined);
    return (
      <M3Card variant="error-container" radius="xl" className="grid gap-2 p-4">
        <p className="m3-lm uppercase flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4" />
          {card.kind} · {card.scope}
        </p>
        <p className="m3-tm">{card.title}</p>
        {card.affects ? <p className="m3-bs">{card.affects}</p> : null}
        <div className="flex flex-wrap gap-2">
          <M3Button
            size="xs"
            variant="filled"
            icon={<TriangleAlert aria-hidden />}
            onClick={() => {
              if (onOpenNotice) onOpenNotice(card.id);
              else if (show) onAction(show);
            }}
          >
            Lihat detail
          </M3Button>
          {source ? (
            <M3Button
              size="xs"
              variant="tonal"
              icon={<ExternalLink aria-hidden />}
              onClick={() => onAction(source)}
            >
              Sumber
            </M3Button>
          ) : null}
        </div>
      </M3Card>
    );
  }

  return (
    <M3Card variant="outlined" radius="xl" className="p-3">
      <a
        href={card.url}
        target="_blank"
        rel="noreferrer"
        className="m3-bs flex items-center gap-2 underline underline-offset-2"
      >
        <ExternalLink aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{card.title}</span>
      </a>
    </M3Card>
  );
}
