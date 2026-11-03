import { ArrowRight, MessageSquare, Moon, Sun, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  RouteMap,
  type MapLeg,
  type MapMarker,
  type NetworkPlatform,
  type NetworkStroke,
} from "../components/map/route-map.js";
import { legIdOf } from "../components/transit/leg-list.js";
import { NETWORK_SYSTEMS } from "../components/map/operator-mark.js";
import { MobileTabBar, type MobileTab } from "../components/layout/mobile-tab-bar.js";
import {
  NetworkDock,
  type NetworkDockTab,
} from "../components/layout/network-dock.js";
import { AccountPanel } from "../features/account/account-panel.js";
import { useAccount } from "../features/account/use-account.js";
import { useRiderMemory } from "../features/account/use-rider-memory.js";
import { ChatPanel } from "../features/chat/chat-panel.js";
import type { ChatAction } from "../features/chat/use-chat.js";
import type { DisruptionSummary } from "../lib/api.js";
import { RouteResult } from "../features/route-planner/route-result.js";
import { RouteSearch } from "../features/route-planner/route-search.js";
import type { ChosenPlace } from "../features/route-planner/place-memory.js";
import type { MemorySuggestion } from "../features/route-planner/place-input.js";
import { usePlan, type PlanRequest } from "../features/route-planner/use-plan.js";
import { api } from "../lib/api.js";
import type { NamedPlace, PersonalAlert, PositionPlan } from "../lib/api.js";
import { Button } from "../components/ui/button.js";
import { cn } from "../lib/cn.js";
import { MODE_WIDTH, SERVICE_CLASS_COLOR, type ServiceClass } from "../lib/format.js";
import { incidentImageId, incidentMarkOf } from "../lib/incident-mark.js";
import { firstOpenIndex, planChoices } from "../lib/route-choice.js";
import { useTheme } from "../lib/theme.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "../components/ui/tooltip.js";
import { useMediaQuery } from "../lib/use-media-query.js";

type Submission = {
  origin: string;
  destination: string;
  originPlace: ChosenPlace | null;
  destinationPlace: ChosenPlace | null;
};

/** Coordinates travel only for a place that is not itself a stop. */
function requestOf(
  submission: Submission,
  at: string | undefined,
  nightSafe: boolean,
): PlanRequest {
  const originPin = submission.originPlace?.kind === "place" ? submission.originPlace : null;
  const destinationPin =
    submission.destinationPlace?.kind === "place" ? submission.destinationPlace : null;
  return {
    origin: submission.origin,
    destination: submission.destination,
    ...(originPin
      ? { originLatitude: originPin.latitude, originLongitude: originPin.longitude }
      : {}),
    ...(destinationPin
      ? {
          destinationLatitude: destinationPin.latitude,
          destinationLongitude: destinationPin.longitude,
        }
      : {}),
    ...(at ? { at } : {}),
    ...(nightSafe ? { nightSafe: true } : {}),
  };
}

/** Whether Jakarta is currently after dark, for the default night mode. */
function isNightNow(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour >= 22 || hour < 5;
}

/** The one sentence a usual-journey notice shows on the empty board. */
function alertSentenceOf(alert: PersonalAlert): string {
  const { originName, destinationName, originLabel, destinationLabel } = alert.habit;
  if (originLabel !== null && destinationLabel !== null) {
    return `A notice touches your usual way from ${originLabel} to ${destinationLabel}.`;
  }
  return `A notice touches your usual way from ${originName} to ${destinationName}.`;
}

/** Turn a local time into the ISO instant the planner expects. */
function departureAt(time: string): string | undefined {
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${date}T${time}:00+07:00`;
}

/**
 * A window control on the map.
 *
 * An open panel fills the button with ink. The icon stays the same mark,
 * so the rider can still see which control they opened.
 */
function mapControlClass(active: boolean, compact = false): string {
  return cn(
    "pointer-events-auto rounded-lg backdrop-blur",
    compact ? "size-9 shadow-raised" : "size-10 shadow-pop",
    active
      ? "border-ink bg-ink text-bg hover:border-ink hover:bg-ink hover:text-bg"
      : "border-line-strong bg-surface/95",
  );
}

/**
 * The planner page.
 *
 * On a phone the map sits above the controls and the two views — planner
 * and assistant — are tabs. From a laptop upwards the map takes the right
 * half of the window and the controls stay in a column on the left.
 */
export function PlannerPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPlace, setOriginPlace] = useState<ChosenPlace | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<ChosenPlace | null>(null);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [departureMode, setDepartureMode] = useState<"now" | "at">("now");
  const [departureTime, setDepartureTime] = useState(() => {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  });
  const [nightSafe, setNightSafe] = useState(isNightNow);
  const account = useAccount();
  const queryClient = useQueryClient();
  /*
   * The rider's own data, read only while somebody is signed in.
   *
   * A 401 is "nobody is signed in", not a failure of the planner: the
   * queries stay off while `account.user` is null, and a later failure
   * only leaves the account section quiet.
   */
  const namedPlaces = useQuery({
    queryKey: ["account", "places"],
    queryFn: () => api.namedPlaces(),
    enabled: account.user !== null,
    retry: false,
  });
  const personalAlerts = useQuery({
    queryKey: ["account", "alerts"],
    queryFn: () => api.personalAlerts(),
    enabled: account.user !== null,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const riderMemory = useRiderMemory(account.user?.id ?? null);
  const {
    saved,
    recentPlaces,
    rememberPlace,
    toggleSaved,
    rememberJourney,
    isSaved,
    toggle: toggleWatch,
    isWatching,
    memoryError,
    memoryLoadFailed,
    retryMemory,
    resetLocal,
  } = riderMemory;
  const [view, setView] = useState("route");
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("plan");
  const [resultExpanded, setResultExpanded] = useState(true);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [dockTab, setDockTab] = useState<NetworkDockTab>("lines");
  const [chatClosing, setChatClosing] = useState(false);
  const chatTimer = useRef<number | null>(null);

  const openChat = (): void => {
    if (chatTimer.current !== null) window.clearTimeout(chatTimer.current);
    setAccountOpen(false);
    setChatClosing(false);
    setMobileTab("assistant");
    setView("chat");
  };

  const closeChat = (): void => {
    if (view !== "chat" || chatClosing) return;
    setChatClosing(true);
    chatTimer.current = window.setTimeout(() => {
      setView("route");
      setMobileTab("plan");
      setChatClosing(false);
      chatTimer.current = null;
    }, 180);
  };

  /** The account sheet and the assistant never share the corner. */
  const openAccount = (): void => {
    if (accountOpen) {
      setAccountOpen(false);
      return;
    }
    setAccountOpen(true);
    setMobileTab("plan");
    if (view === "chat") closeChat();
  };

  const signOutAccount = async (): Promise<void> => {
    await account.signOut();
    resetLocal();
  };

  const deleteAccount = async (password: string): Promise<void> => {
    await account.deleteAccount(password);
    resetLocal();
  };

  /** A named place is written through the account, then cached from its answer. */
  const saveNamedPlace = async (
    label: string,
    place: NamedPlace["place"],
  ): Promise<void> => {
    const result = await api.saveNamedPlace(label, place);
    queryClient.setQueryData(["account", "places"], result);
  };

  const removeNamedPlace = async (label: string): Promise<void> => {
    const result = await api.deleteNamedPlace(label);
    queryClient.setQueryData(["account", "places"], result);
  };

  /**
   * The bottom bar is the phone's way around the window.
   *
   * It switches between the planner, the service board and the
   * assistant. The map never unmounts, so the camera and the chosen
   * journey stay where the reader left them.
   */
  const changeMobileTab = (tab: MobileTab): void => {
    setAccountOpen(false);
    if (tab === "assistant") {
      openChat();
      return;
    }
    if (chatTimer.current !== null) {
      window.clearTimeout(chatTimer.current);
      chatTimer.current = null;
    }
    setChatClosing(false);
    setView("route");
    setMobileTab(tab);
    if (tab === "network" || tab === "alerts") {
      setDockOpen(true);
      setDockTab(tab === "alerts" ? "notices" : "lines");
    }
  };

  const openNotices = (): void => {
    setDockOpen(true);
    setDockTab("notices");
    setMobileTab("alerts");
    if (view === "chat") setView("route");
  };

  /** A first route, for the rider who has not chosen one yet. */
  const runExample = (from: string, to: string): void => {
    setOrigin(from);
    setDestination(to);
    setOriginPlace(null);
    setDestinationPlace(null);
    setWalk(null);
    setWalkError(null);
    setActiveIndex(0);
    setSubmitted({
      origin: from,
      destination: to,
      originPlace: null,
      destinationPlace: null,
    });
    setMobileTab("plan");
  };
  /**
   * The walk from the reader's place to the stop the journey starts
   * from. It is drawn on the map as the first part of the journey.
   */
  const [walk, setWalk] = useState<PositionPlan | null>(null);
  const [walkError, setWalkError] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const walkPlan = useMutation({
    mutationFn: (input: {
      coordinates: { latitude: number; longitude: number };
      destination: string;
    }) => api.planFromPosition(input.coordinates, input.destination),
    onSuccess: (plan) => {
      setWalk(plan);
      setWalkError(null);
    },
    onError: () => {
      setWalk(null);
      setWalkError("The walk could not be planned. Choose a stop instead.");
    },
  });
  const { theme, toggle: toggleTheme } = useTheme();

  const network = useQuery({
    queryKey: ["network-overview"],
    queryFn: api.networkOverview,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [hiddenSystems, setHiddenSystems] = useState<ReadonlySet<string>>(() => new Set());
  const visibleSystems = useMemo(
    () => NETWORK_SYSTEMS.map((entry) => entry.id).filter((id) => !hiddenSystems.has(id)),
    [hiddenSystems],
  );
  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (const line of network.data?.lines ?? []) {
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      counts[line.systemId] = (counts[line.systemId] ?? 0) + 1;
    }
    return counts;
  }, [network.data]);
  const toggleSystem = (id: string): void => {
    setHiddenSystems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [glance, setGlance] = useState<{
    id: string;
    token: string;
    longitude: number;
    latitude: number;
  } | null>(null);
  /**
   * The notice the reader followed.
   *
   * A notice about a corridor has no single point, so the map is asked to
   * frame the corridor itself and light it up. A notice about a stop (or
   * several, when a street is closed) frames those stops.
   */
  const [focus, setFocus] = useState<{
    id: string;
    token: string;
    /** The journey that owns the camera; a new one drops the old focus. */
    planKey: string;
    points: { latitude: number; longitude: number }[];
    lineId: string | null;
  } | null>(null);
  const noticeToken = useRef(0);
  const showNotice = (notice: DisruptionSummary): void => {
    noticeToken.current += 1;
    const token = `${notice.id}:${noticeToken.current}`;
    if (notice.scope === "stop" && notice.stations.length > 0) {
      setFocus({
        id: notice.id,
        token,
        planKey,
        points: notice.stations.map((station) => ({
          latitude: station.latitude,
          longitude: station.longitude,
        })),
        lineId: null,
      });
      setGlance(null);
      return;
    }
    if (notice.scope === "line" && notice.lines.length > 0) {
      const lineId = notice.lines[0]?.id ?? null;
      const stroke = (network.data?.lines ?? []).find((line) => line.id === lineId);
      setFocus({
        id: notice.id,
        token,
        planKey,
        points: stroke ? strokeCoordinates(stroke.coordinates) : [],
        lineId,
      });
      setGlance(null);
    }
  };
  const watch = useQuery({
    queryKey: ["disruptions"],
    queryFn: api.disruptions,
    refetchInterval: 60_000,
    retry: false,
  });

  const planAt = departureMode === "at" ? departureAt(departureTime) : undefined;
  const plan = usePlan(submitted ? requestOf(submitted, planAt, nightSafe) : null);

  useEffect(() => {
    if (!plan.data || !submitted) return;
    rememberJourney({
      originName: submitted.origin,
      destinationName: submitted.destination,
      origin: submitted.originPlace,
      destination: submitted.destinationPlace,
    });
  }, [plan.data, submitted, rememberJourney]);

  const planKey = plan.data?.computedAt ?? "";
  // The notice the map should follow now. A new journey drops the corridor
  // the reader followed before, so the camera belongs to one thing at a time.
  const activeFocus = focus && focus.planKey === planKey ? focus : null;

  const [selection, setSelection] = useState<{ key: string; index: number | null } | null>(null);
  const [legState, setLegState] = useState<{ key: string; leg: string | null }>({ key: "", leg: null });
  const activeIndex =
    selection && selection.key === planKey
      ? selection.index
      : plan.data
        ? firstOpenIndex(planChoices(plan.data), plan.data.disruptions)
        : null;
  const activeLeg = legState.key === planKey ? legState.leg : null;
  const watchedChoice = plan.data
    ? planChoices(plan.data)[activeIndex ?? firstOpenIndex(planChoices(plan.data), plan.data.disruptions)]
    : undefined;
  const watchedLines = (watchedChoice?.legs ?? [])
    .filter((leg) => leg.kind === "ride" && leg.lineCode)
    .map((leg) => leg.lineCode as string);
  const watchKey =
    plan.data && watchedLines.length > 0
      ? `${plan.data.origin.id}>${plan.data.destination.id}:${watchedLines.join(",")}`
      : null;
  const watching = isWatching(watchKey);
  const toggleWatchTrip = (): void => {
    if (!plan.data || !watchKey) return;
    toggleWatch({
      key: watchKey,
      origin: plan.data.origin.name,
      destination: plan.data.destination.name,
      lines: watchedLines,
      savedAt: new Date().toISOString(),
    });
  };
  const setActiveLeg = (leg: string | null): void => {
    setLegState({ key: planKey, leg });
  };
  const setActiveIndex = (index: number | null): void => {
    setSelection({ key: planKey, index });
    setActiveLeg(null);
  };
  const runChatAction = (action: ChatAction): void => {
    if (action.type === "open_source") {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.type === "show_notice") {
      const notice = (watch.data ?? []).find((item) => item.id === action.disruptionId);
      if (notice) showNotice(notice);
      else {
        setGlance({
          id: action.disruptionId,
          token: `${action.disruptionId}:${Date.now()}`,
          longitude: action.longitude,
          latitude: action.latitude,
        });
      }
      setView("route");
      setMobileTab("plan");
      return;
    }
    if (action.type === "show_stop") {
      setGlance({
        id: action.stationId,
        token: `${action.stationId}:${Date.now()}`,
        longitude: action.longitude,
        latitude: action.latitude,
      });
      setView("route");
      setMobileTab("plan");
      return;
    }
    if (action.type === "set_origin" || action.type === "set_destination") {
      const place: ChosenPlace = {
        kind: "station",
        id: action.stationId,
        name: action.name,
        latitude: action.latitude,
        longitude: action.longitude,
      };
      if (action.type === "set_origin") {
        setOrigin(action.name);
        setOriginPlace(place);
      } else {
        setDestination(action.name);
        setDestinationPlace(place);
      }
      setView("route");
      setMobileTab("plan");
      return;
    }
    setOrigin(action.origin);
    setDestination(action.destination);
    setOriginPlace(null);
    setDestinationPlace(null);
    setWalk(null);
    setActiveIndex(0);
    setSubmitted({
      origin: action.origin,
      destination: action.destination,
      originPlace: null,
      destinationPlace: null,
    });
    setView("route");
    setMobileTab("plan");
  };

  /*
   * What an empty place field offers, in the order it should be read.
   *
   * The rider's named places come first, because the rider chose those
   * names. A place that is already named is not listed again under "Saved"
   * or "Recent", so the same stop does not appear three times.
   */
  const memorySuggestions = useMemo<MemorySuggestion[]>(() => {
    const named = namedPlaces.data?.places ?? [];
    const namedIds = new Set(named.map((entry) => entry.place.id));
    const savedRows = saved.filter((place) => !namedIds.has(place.id));
    const savedIds = new Set(saved.map((place) => place.id));
    return [
      ...named.map((entry) => ({
        id: `named:${entry.label}`,
        name: entry.place.name,
        detail: entry.label,
        place: entry.place,
      })),
      ...savedRows.map((place) => ({
        id: place.id,
        name: place.name,
        detail: "Saved",
        place,
      })),
      ...recentPlaces
        .filter((place) => !namedIds.has(place.id) && !savedIds.has(place.id))
        .map((place) => ({
          id: place.id,
          name: place.name,
          detail: "Recent",
          place,
        })),
    ];
  }, [namedPlaces.data, saved, recentPlaces]);

  /**
   * The leg of the journey the reader is pointing at.
   *
   * The list and the map are one system: pointing at a leg in the list
   * keeps that leg bright on the map, and pointing at a leg on the map
   * lights it up in the list.
   */
  /** The stop the reader is pointing at in the list. */
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);

  const { legs: mapLegs, markers, frame } = useMemo(() => {
    const data = plan.data;
    // On the idle map the notice board carries the disruptions. Drawing a
    // red plate at every closed stop turns the city into a rash; once the
    // rider has a journey, or follows a notice, the map shows the ones
    // that matter.
    const showIncidents = Boolean(data) || Boolean(activeFocus) || Boolean(glance);
    const watched = showIncidents
      ? [...(data?.disruptions ?? []), ...(data?.watch ?? []), ...(data ? [] : (watch.data ?? []))]
      : [];
    const incidents: MapMarker[] = [];
    const seenIncidents = new Set<string>();
    for (const notice of watched) {
      if (!notice.activeNow) continue;
      if (seenIncidents.has(notice.id)) continue;
      seenIncidents.add(notice.id);
      // A notice about a street closure names several stops; each one is a
      // point on the map. A corridor notice has no stop to draw here: it is
      // drawn as the corridor when the reader follows it.
      for (const station of notice.stations) {
        incidents.push({
          id: `incident-${notice.id}-${station.id}`,
          stationId: station.id,
          latitude: station.latitude,
          longitude: station.longitude,
          label: station.name,
          detail: notice.demonstration ? `Sample watch. ${notice.body}` : notice.body,
          kind: "incident",
          mark: incidentImageId(incidentMarkOf(notice.mark, notice.kind)),
          selected: activeFocus?.id === notice.id || glance?.id === notice.id ? 1 : 0,
        });
      }
    }
    if (!data) return { legs: [] as MapLeg[], markers: incidents, frame: [] };

    const choices = planChoices(data);
    const primary = activeIndex === null ? undefined : choices[activeIndex];

    // Every leg is drawn in the colour of its own mode, so a journey that
    // changes mode is readable on the map without a legend.
    const legs: MapLeg[] = [];
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.geometry.length < 2) continue;
      legs.push({
        id: legIdOf(leg, index),
        highlighted: activeLeg === legIdOf(leg, index),
        coordinates: leg.geometry,
        color:
          leg.kind === "walk"
            ? "var(--ink-3)"
            : (SERVICE_CLASS_COLOR[leg.serviceClass as ServiceClass] ?? "var(--accent)"),
        width: leg.kind === "walk" ? 3 : (MODE_WIDTH[leg.mode] ?? 4),
        kind: leg.kind,
        serviceClass: leg.serviceClass,
        systemId: leg.lineId ? leg.lineId.split(":")[0] ?? null : null,
        label: leg.kind === "walk" ? "Walk" : (leg.lineName ?? leg.lineCode ?? ""),
        order: index + 1,
      });
    }

    /*
     * The walk comes first: it is how the journey begins, and it is the
     * part the reader has to do on foot.
     */
    if (walk?.walk && walk.stationName) {
      legs.unshift({
        id: "walk-from-here",
        coordinates: walk.walk.geometry,
        color: "var(--ink-3)",
        width: 3,
        kind: "walk",
        label: `Walk to ${walk.stationName}`,
        order: 0,
      });
    }

    const firstRide = legs.find((leg) => leg.kind === "ride");
    const lastRide = [...legs].reverse().find((leg) => leg.kind === "ride");
    const markers: MapMarker[] = [
      {
        id: "origin",
        latitude: data.origin.latitude,
        longitude: data.origin.longitude,
        label: data.origin.name,
        detail: "Origin",
        kind: "origin",
        systemId: firstRide?.systemId ?? null,
        order: 1,
      },
    ];

    // The points where the rider changes vehicle. They are marked first,
    // because they sit on a stop of the line before and after it.
    const transfers: MapMarker[] = [];
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.kind !== "walk") continue;
      const first = leg.stops[0];
      const last = leg.stops[leg.stops.length - 1];
      if (!first || !last) continue;
      const isTransfer = leg.walkReason === "transfer";
      const nextRide = (primary?.legs ?? []).slice(index + 1).find((item) => item.kind === "ride");
      transfers.push({
        id: `transfer-${index}`,
        latitude: (first.latitude + last.latitude) / 2,
        longitude: (first.longitude + last.longitude) / 2,
        label: first.name === last.name ? first.name : `${first.name} → ${last.name}`,
        detail: isTransfer
          ? `Change to ${leg.nextLineName ?? "the next vehicle"}`
          : leg.walkReason === "access"
            ? "Walk to the first vehicle"
            : "Walk from the last vehicle",
        kind: isTransfer ? "transfer" : "stop",
        systemId: nextRide?.lineId?.split(":")[0] ?? null,
        order: index + 1,
      });
    }

    // The stops of every ride, except the ones a transfer already marks.
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.kind !== "ride") continue;
      for (const stop of leg.stops) {
        const alreadyMarked = transfers.some(
          (transfer) =>
            Math.abs(transfer.latitude - stop.latitude) < 0.0003 &&
            Math.abs(transfer.longitude - stop.longitude) < 0.0003,
        );
        if (alreadyMarked) continue;
        if (incidents.some((incident) => incident.stationId === stop.stationId)) continue;
        markers.push({
          id: `${stop.stationId}-${index}`,
          stationId: stop.stationId,
          latitude: stop.latitude,
          longitude: stop.longitude,
          label: stop.name,
          detail: leg.lineName ?? undefined,
          kind: "stop",
          systemId: leg.lineId?.split(":")[0] ?? null,
        });
      }
    }

    markers.push(...transfers);
    markers.push(...incidents);

    markers.push({
      id: "destination",
      latitude: data.destination.latitude,
      longitude: data.destination.longitude,
      label: data.destination.name,
      detail: "Destination",
      kind: "destination",
      systemId: lastRide?.systemId ?? null,
      order: (primary?.legs.length ?? 0) + 1,
    });

    // The camera follows the way being read. A closure that this way
    // avoids stays a point on the map, and does not pull the frame open.
    return { legs, markers, frame: [] };
  }, [plan.data, activeIndex, activeLeg, walk, watch.data, glance, activeFocus]);

  // Under a journey the map keeps the trunk lines and the journey's own
  // stops. The full local network and 5,700 stop symbols are the idle
  // map's job; drawing them under a route is noise and costs frames.
  const mapNetwork = useMemo(() => {
    const lines = (network.data?.lines ?? []) as NetworkStroke[];
    return plan.data ? lines.filter((line) => line.tier === "primary") : lines;
  }, [network.data, plan.data]);
  const mapPlaces = plan.data ? [] : (network.data?.places ?? []);

  const demoNotice = watch.data?.find((item) => item.demonstration);
  const activeNotices = (watch.data ?? []).filter((notice) => notice.activeNow).length;

  /*
   * One usual-journey notice for the empty board, and only while somebody
   * is signed in. A signed-out rider is never asked to sign in for it: the
   * board simply has no strip.
   */
  const firstAlert = personalAlerts.data?.alerts[0] ?? null;
  const firstNotice = firstAlert?.notices[0] ?? null;
  const emptyAlert =
    account.user !== null && firstAlert !== null && firstNotice !== null
      ? {
          sentence: alertSentenceOf(firstAlert),
          count: firstAlert.habit.count,
          noticeTitle: firstNotice.title,
          onShow: () =>
            runExample(firstAlert.habit.originName, firstAlert.habit.destinationName),
        }
      : undefined;

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-bg">
      {/*
       * The map owns the window.
       *
       * The rider is looking at a city, and the controls float on top of
       * it. The brand lives on the search board and the service board, not
       * in a bar across the top of the window.
       */}
      <div className="relative col-start-1 row-start-1 h-full min-h-0">
        <RouteMap
          legs={mapLegs}
          markers={markers}
          theme={theme}
          highlightedStationId={hoveredStation}
          frame={plan.data ? frame : []}
          network={mapNetwork}
          platforms={(network.data?.platforms ?? []) as NetworkPlatform[]}
          places={mapPlaces}
          visibleSystems={visibleSystems}
          glance={glance}
          focus={activeFocus}
          onMarkerClick={(marker) => {
            // A point on the map points at a leg of the journey.
            const choices = plan.data ? planChoices(plan.data) : [];
            const primary = activeIndex === null ? undefined : choices[activeIndex];
            const index = (primary?.legs ?? []).findIndex((leg) =>
              leg.stops.some(
                (stop) =>
                  Math.abs(stop.latitude - marker.latitude) < 0.0004 &&
                  Math.abs(stop.longitude - marker.longitude) < 0.0004,
              ),
            );
            if (index >= 0 && primary?.legs[index]) {
              setActiveLeg(legIdOf(primary.legs[index] as never, index));
            }
          }}
        />
        <p className="pointer-events-none absolute right-2 bottom-[calc(var(--bottom-bar-h)+env(safe-area-inset-bottom)+6px)] z-10 font-mono text-[12px] leading-[1.2] text-ink-3 lg:bottom-2 lg:left-[440px] lg:right-auto">
          © OpenStreetMap · OpenFreeMap
        </p>
      </div>

      {/*
       * The controls of the window.
       *
       * They sit in the top right corner on a wide screen. The map has no
       * zoom buttons: the scroll wheel, a pinch, and the keyboard still
       * zoom.
       */}
      <div className="pointer-events-none absolute right-3 top-3 z-50 hidden items-center gap-2 lg:flex">
        <Tooltip label={view === "chat" ? "Hide assistant" : "Ask the assistant"}>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Ask the assistant"
            aria-pressed={view === "chat"}
            onClick={() => (view === "chat" ? closeChat() : openChat())}
            className={mapControlClass(view === "chat")}
          >
            <MessageSquare aria-hidden className="size-4" />
          </Button>
        </Tooltip>

        <Tooltip label={accountOpen ? "Close account" : "Account"}>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Account"
            aria-pressed={accountOpen}
            onClick={openAccount}
            className={mapControlClass(accountOpen)}
          >
            <UserRound aria-hidden className="size-4" />
          </Button>
        </Tooltip>

        <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"}>
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleTheme}
            aria-label="Switch theme"
            className="pointer-events-auto size-10 rounded-lg border-line-strong bg-surface/95 shadow-pop backdrop-blur"
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="size-4 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon aria-hidden className="size-4 transition-transform duration-300 hover:-rotate-12" />
            )}
          </Button>
        </Tooltip>
      </div>

      {/* The theme switch and the account stay on the map on a phone; the
          bottom bar owns the assistant. */}
      <div className={cn("pointer-events-none absolute right-3 top-[calc(var(--bar-h)+8px)] z-30 flex items-center gap-2 lg:hidden", view === "chat" && "max-lg:hidden")}>
        <Tooltip label={accountOpen ? "Close account" : "Account"}>
          <Button
            variant="secondary"
            size="icon"
            onClick={openAccount}
            aria-label="Account"
            aria-pressed={accountOpen}
            className={mapControlClass(accountOpen, true)}
          >
            <UserRound aria-hidden className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"}>
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleTheme}
            aria-label="Switch theme"
            className="pointer-events-auto size-9 rounded-lg border-line-strong bg-surface/95 shadow-raised"
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="size-4 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon aria-hidden className="size-4 transition-transform duration-300 hover:-rotate-12" />
            )}
          </Button>
        </Tooltip>
      </div>

      {/*
       * The search and the answer.
       *
       * On a wide screen they are one column on the left. On a phone the
       * search is the top of the window and the answer is a sheet above
       * the bottom bar.
       */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-0 pb-3",
          "lg:right-auto lg:w-[420px] lg:justify-start lg:gap-3 lg:p-4",
        )}
      >
        <div className="pointer-events-auto lg:shrink-0">
          <RouteSearch
            origin={origin}
            destination={destination}
            onOriginChange={(value) => {
              setOrigin(value);
              setOriginPlace((current) => (current && current.name === value ? current : null));
            }}
            onDestinationChange={(value) => {
              setDestination(value);
              setDestinationPlace((current) => (current && current.name === value ? current : null));
            }}
            onSelectOrigin={(place) => {
              setOrigin(place.name);
              setOriginPlace(place);
              rememberPlace(place);
            }}
            onSelectDestination={(place) => {
              setDestination(place.name);
              setDestinationPlace(place);
              rememberPlace(place);
            }}
            onSwap={() => {
              setOrigin(destination);
              setDestination(origin);
              setOriginPlace(destinationPlace);
              setDestinationPlace(originPlace);
            }}
            originCanSave={originPlace !== null}
            destinationCanSave={destinationPlace !== null}
            originSaved={isSaved(originPlace)}
            destinationSaved={isSaved(destinationPlace)}
            onToggleSavedOrigin={() => {
              if (originPlace) toggleSaved(originPlace);
            }}
            onToggleSavedDestination={() => {
              if (destinationPlace) toggleSaved(destinationPlace);
            }}
            memory={memorySuggestions}
            notice={
              plan.data || !demoNotice
                ? null
                : { title: demoNotice.title, demonstration: true }
            }
            departureMode={departureMode}
            departureTime={departureTime}
            onDepartureModeChange={(mode) => {
              setDepartureMode(mode);
              if (mode === "at" && departureTime.length === 0) {
                setDepartureTime(
                  new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Asia/Jakarta",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date()),
                );
              }
            }}
            onDepartureTimeChange={(time) => {
              setDepartureTime(time);
              setDepartureMode("at");
              const hour = Number(time.slice(0, 2));
              if (Number.isFinite(hour) && (hour >= 22 || hour < 5)) setNightSafe(true);
            }}
            nightSafe={nightSafe}
            onNightSafeChange={setNightSafe}
            onSubmit={() => {
              setActiveIndex(0);
              setWalk(null);
              setMobileTab("plan");
              setSubmitted({
                origin: origin.trim(),
                destination: destination.trim(),
                originPlace,
                destinationPlace,
              });
            }}
            onUseMyPosition={async () => {
              if (typeof navigator === "undefined" || !navigator.geolocation) return;
              const position = await new Promise<GeolocationPosition | null>((resolve) => {
                navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
                  enableHighAccuracy: true,
                  timeout: 15_000,
                });
              });
              if (!position) return;
              const here: ChosenPlace = {
                kind: "place",
                id: `place:${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`,
                name: "My location",
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              setOrigin(here.name);
              setOriginPlace(here);
              setWalk(null);
              setWalkError(null);
              if (destination.trim().length <= 1) {
                setWalk({
                  needsDestination: true,
                  stationId: null,
                  stationName: null,
                  totalMinutes: null,
                  transferCount: null,
                  distanceKm: null,
                  walkingKm: null,
                  accessWalkKm: null,
                  walk: null,
                  profiles: [],
                  candidates: [],
                });
                return;
              }
              walkPlan.mutate({
                coordinates: {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                },
                destination: destination.trim(),
              });
            }}
            onChooseOrigin={(profileId) => {
              const profile = walk?.profiles.find((item) => item.id === profileId);
              if (!profile?.stationName) return;
              setOrigin(profile.stationName);
              setOriginPlace(null);
              setActiveIndex(0);
              setSubmitted({
                origin: profile.stationName,
                destination: destination.trim(),
                originPlace: null,
                destinationPlace,
              });
            }}
            walk={walk}
            walkError={walkError}
          />
        </div>

        <div
          className={cn(
            "pointer-events-auto relative flex min-h-0 flex-col",
            "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--bottom-bar-h)+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:px-2 max-lg:pb-2 max-lg:transition-[height] max-lg:duration-300 max-lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:max-lg:transition-none",
            resultExpanded ? "max-lg:h-[52dvh]" : "max-lg:h-[30dvh]",
            "lg:static lg:max-h-none lg:flex-1 lg:px-0 lg:pb-0",
            mobileTab !== "plan" && "max-lg:hidden",
          )}
        >
          {plan.data ? (
            <button
              type="button"
              onClick={() => setResultExpanded((open) => !open)}
              aria-label={resultExpanded ? "Collapse the journey" : "Expand the journey"}
              aria-expanded={resultExpanded}
              className="absolute left-1/2 top-1 z-10 flex h-4 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full lg:hidden"
            >
              <span aria-hidden className="h-1 w-8 rounded-full bg-line-strong" />
            </button>
          ) : null}
          {plan.data || plan.isFetching || plan.isError ? (
            <RouteResult
              plan={plan}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              activeLeg={activeLeg}
              onLegSelect={setActiveLeg}
              onStopHover={setHoveredStation}
              onRetry={() => {
                setSubmitted((current) => (current ? { ...current } : null));
              }}
              watching={watching}
              onToggleWatch={toggleWatchTrip}
              onClose={() => {
                setSubmitted(null);
                setWalk(null);
                setWalkError(null);
                setActiveIndex(null);
                setActiveLeg(null);
                setResultExpanded(true);
              }}
              className="max-lg:h-full"
            />
          ) : (
            <PlanEmptyState
              notices={activeNotices}
              networkReady={network.isSuccess}
              alert={emptyAlert}
              onExample={runExample}
              onOpenNotices={openNotices}
              className="max-lg:hidden"
            />
          )}
        </div>
      </div>

      {/*
       * The service board.
       *
       * On a wide screen it sits in the bottom right corner. On a phone it
       * is the sheet behind the Lines and Alerts tabs of the bottom bar.
       */}
      <NetworkDock
        legs={mapLegs}
        networkReady={network.isSuccess}
        networkError={network.isError}
        hiddenSystems={hiddenSystems}
        onToggleSystem={toggleSystem}
        systemCounts={systemCounts}
        notices={watch.data ?? []}
        noticesReady={watch.isSuccess}
        noticesError={watch.isError}
        activeId={glance?.id ?? null}
        onShow={showNotice}
        onRetry={() => void watch.refetch()}
        open={dockOpen}
        onToggleOpen={() => setDockOpen((open) => !open)}
        tab={dockTab}
        onTabChange={setDockTab}
        onClose={() => setMobileTab("plan")}
        hiddenFromKeyboard={!isDesktop && mobileTab !== "network" && mobileTab !== "alerts"}
        className={cn(
          "pointer-events-auto fixed inset-x-2 bottom-[calc(var(--bottom-bar-h)+env(safe-area-inset-bottom)+8px)] z-40",
          "lg:inset-x-auto lg:bottom-4 lg:right-4 lg:z-30 lg:w-[380px]",
          (mobileTab === "plan" || mobileTab === "assistant") &&
            "max-lg:pointer-events-none max-lg:translate-y-[calc(100%+16px)] max-lg:opacity-0",
          view === "chat" && "hidden",
        )}
      />

      {view === "chat" ? (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-2 bottom-[calc(var(--bottom-bar-h)+env(safe-area-inset-bottom)+8px)] top-[calc(var(--bar-h)+8px)] z-40 flex flex-col",
            "lg:inset-auto lg:right-4 lg:top-16 lg:w-[400px]",
            chatClosing ? "chat-sheet-out" : "chat-sheet-in",
          )}
        >
          <ChatPanel
            onClose={closeChat}
            onAction={runChatAction}
            origin={origin.trim() || undefined}
            destination={destination.trim() || undefined}
            at={planAt}
            nightSafe={nightSafe}
            places={memorySuggestions}
          />
        </div>
      ) : null}

      {accountOpen ? (
        <div className="pointer-events-none fixed inset-x-2 bottom-[calc(var(--bottom-bar-h)+env(safe-area-inset-bottom)+8px)] top-[calc(var(--bar-h)+8px)] z-40 flex flex-col lg:inset-auto lg:right-4 lg:top-16 lg:w-[400px] chat-sheet-in">
          <AccountPanel
            key={account.user?.id ?? "signed-out"}
            user={account.user}
            pending={account.pending}
            places={namedPlaces.data?.places ?? []}
            memoryError={memoryError}
            memoryLoadFailed={memoryLoadFailed}
            onSignUp={account.signUp}
            onSignIn={account.signIn}
            onSignOut={signOutAccount}
            onChangePassword={account.changePassword}
            onDeleteAccount={deleteAccount}
            onRetryMemory={retryMemory}
            onSavePlace={saveNamedPlace}
            onRemovePlace={removeNamedPlace}
            onClose={() => setAccountOpen(false)}
          />
        </div>
      ) : null}

      <MobileTabBar
        active={view === "chat" ? "assistant" : mobileTab}
        noticeCount={activeNotices}
        onChange={changeMobileTab}
      />
    </div>
  );
}

/**
 * The first screen of the planner.
 *
 * A rider who has not chosen a route sees what the board is for, a way to
 * begin, and the state of the network. It is not a dashed empty box.
 */
function PlanEmptyState({
  notices,
  networkReady,
  alert,
  onExample,
  onOpenNotices,
  className,
}: {
  notices: number;
  networkReady: boolean;
  /** A usual-journey notice that touches a stored plan, when one exists. */
  alert?:
    | {
        sentence: string;
        count: number;
        noticeTitle: string;
        onShow: () => void;
      }
    | undefined;
  onExample: (from: string, to: string) => void;
  onOpenNotices: () => void;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-[12px] border-t-2 border-t-ink p-4", className)}>
      {alert ? (
        <div className="mb-4 border-l-2 border-warn bg-warn-soft px-3 py-2">
          <p className="text-[13px] leading-[1.5] text-ink">{alert.sentence}</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-ink-2">{alert.noticeTitle}</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-ink-3">
            Based on {alert.count} planned journeys. Not a live departure.
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={alert.onShow}>
            Show this journey
          </Button>
        </div>
      ) : null}
      <p className="eyebrow">Route board</p>
      <h2 className="mt-3 text-[28px] font-bold leading-[1.2] tracking-[-0.025em] text-ink">
        Where to?
      </h2>
      <p className="mt-1 max-w-[34ch] text-[13px] leading-[1.5] text-ink-2">
        Choose a start and a destination. The board shows the fare, the
        changes, and any closure on the way.
      </p>

      <div className="mt-4 border-t border-line/70 pt-3">
        <p className="eyebrow">Try a route</p>
        <div className="mt-2 grid gap-1">
          <button
            type="button"
            onClick={() => onExample("Bundaran HI", "Kota")}
            className="press flex w-full cursor-pointer items-center gap-2 rounded-md border border-line-strong/70 bg-surface px-3 py-2 text-left transition-colors hover:border-ink hover:bg-surface-2"
          >
            <span className="size-2 rounded-full border-2 border-accent bg-surface" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              Bundaran HI
              <span className="mx-2 text-ink-3">→</span>
              Kota
            </span>
            <ArrowRight aria-hidden className="size-3.5 text-ink-3" />
          </button>
          <button
            type="button"
            onClick={() => onExample("Lebak Bulus", "Dukuh Atas")}
            className="press flex w-full cursor-pointer items-center gap-2 rounded-md border border-line-strong/70 bg-surface px-3 py-2 text-left transition-colors hover:border-ink hover:bg-surface-2"
          >
            <span className="size-2 rounded-[4px] bg-ink" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              Lebak Bulus
              <span className="mx-2 text-ink-3">→</span>
              Dukuh Atas
            </span>
            <ArrowRight aria-hidden className="size-3.5 text-ink-3" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
        <p className="font-mono text-[12px] leading-[1.2] text-ink-3">
          {networkReady ? `${notices} ${notices === 1 ? "notice" : "notices"} open` : "Loading the network"}
        </p>
        <button
          type="button"
          onClick={onOpenNotices}
          className="inline-flex cursor-pointer items-center gap-1 font-mono text-[12px] font-medium uppercase leading-[1.2] tracking-[0.04em] text-accent hover:text-accent-hover"
        >
          Open board
          <ArrowRight aria-hidden className="size-3" />
        </button>
      </div>
    </section>
  );
}
/** The flat `[longitude, latitude, …]` of a network stroke, as points. */
function strokeCoordinates(flat: readonly number[]): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const longitude = flat[index];
    const latitude = flat[index + 1];
    if (longitude === undefined || latitude === undefined) continue;
    points.push({ latitude, longitude });
  }
  return points;
}
