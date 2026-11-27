import { Map as MapIcon, MessageSquare, Route as RouteIcon, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RouteMap,
  type MapLeg,
  type MapMarker,
  type NetworkPlatform,
  type NetworkStroke,
} from "../components/map/route-map.js";
import { legIdOf } from "../components/transit/leg-list.js";
import { NETWORK_SYSTEMS } from "../components/map/operator-mark.js";
import {
  M3NavigationBar,
  M3NavigationRail,
  type M3NavigationItem,
} from "../components/m3e/index.js";
import { AccountPanel } from "../features/account/account-panel.js";
import { useAccount } from "../features/account/use-account.js";
import { useRiderMemory } from "../features/account/use-rider-memory.js";
import { ChatPanel } from "../features/chat/chat-panel.js";
import type { ChatAction } from "../features/chat/use-chat.js";
import type {
  DisruptionSummary,
  NamedPlace,
  PositionPlan,
} from "../lib/api.js";
import { displayNameOf, type ChosenPlace } from "../features/route-planner/place-memory.js";
import { useCurrentPlace } from "../features/route-planner/use-current-place.js";
import type { MemorySuggestion } from "../features/route-planner/place-input.js";
import { usePlan, type PlanRequest } from "../features/route-planner/use-plan.js";
import { api } from "../lib/api.js";
import { MODE_WIDTH, formatDistance, formatDuration } from "../lib/format.js";
import { incidentImageId, incidentMarkOf } from "../lib/incident-mark.js";
import { firstOpenIndex, planChoices } from "../lib/route-choice.js";
import { lineColorsOf, lineKeyOf, ROUTE_WALK_COLOR } from "../lib/route-colors.js";
import { useTheme } from "../lib/theme.js";
import { useMediaQuery } from "../lib/use-media-query.js";
import { useMutation as useWalkMutation } from "@tanstack/react-query";

import {
  MapHomeOverlay,
  type HomeFeatured,
  type HomeModeFilter,
  type HomeQuickPlace,
} from "../features/route-planner/map-home-overlay.js";
import { SearchScreen } from "../features/route-planner/search-screen.js";
import { RouteChoicesView } from "../features/route-planner/route-choices-view.js";
import { RouteDetailView } from "../features/route-planner/route-detail-view.js";
import { LiveTripView } from "../features/route-planner/live-trip-view.js";
import { ArrivedView } from "../features/route-planner/arrived-view.js";
import type { RouteSortMode } from "../features/route-planner/route-sort.js";
import { readRoutines } from "../features/route-planner/live-trip.js";
import { AlternativeRouteView } from "../features/monitor/alternative-route-view.js";
import { DisruptionDetailView } from "../features/monitor/disruption-detail-view.js";
import { InboxView } from "../features/monitor/inbox-view.js";
import {
  buildInboxItems,
  readInboxReadIds,
  unreadInboxCount,
} from "../features/monitor/inbox-items.js";
import { useFollowedLines } from "../features/transit/followed-lines.js";
import { LineDetailView } from "../features/transit/line-detail-view.js";
import { LineStatusView } from "../features/transit/line-status-view.js";
import { StationDetailView } from "../features/transit/station-detail-view.js";

type Submission = {
  origin: string;
  destination: string;
  originPlace: ChosenPlace | null;
  destinationPlace: ChosenPlace | null;
};

type AppTab = "map" | "lines" | "chat" | "me";

type MapStage = "home" | "search" | "choices" | "detail" | "live" | "arrived";

/** One screen stacked over the current tab. The last entry owns the window. */
type DetailRoute =
  | { kind: "line"; lineId: string }
  | { kind: "station"; stationId: string }
  | { kind: "notice"; noticeId: string }
  | { kind: "alternatives"; noticeId: string };

type FeaturedPair = {
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
  reason: "alert" | "recent" | "example";
  alertCount: number;
};

/** Coordinates travel only for a place that is not itself a stop. */
function requestOf(submission: Submission, at: string | undefined): PlanRequest {
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
  };
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

function greetingOf(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
  if (hour < 11) return "Pagi";
  if (hour < 15) return "Siang";
  if (hour < 19) return "Sore";
  return "Malam";
}

function initialTab(): AppTab {
  if (typeof window === "undefined") return "map";
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "lines") return "lines";
  if (tab === "alerts") return "chat";
  if (tab === "chat") return "chat";
  if (tab === "me") return "me";
  return "map";
}

function initialInbox(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tab") === "alerts";
}

function initialStage(): MapStage {
  if (typeof window === "undefined") return "home";
  const action = new URLSearchParams(window.location.search).get("action");
  return action === "search" ? "search" : "home";
}

function minutesSince(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return fallback;
  return Math.max(1, Math.round((Date.now() - started) / 60_000));
}

/**
 * The planner page.
 *
 * The map is the page. On a phone the four destinations are the M3
 * navigation bar; from 1024 px they become the rail on the left. The map
 * flow is one state machine: home, search, choices, detail, live and
 * arrived. A stage that owns a floating toolbar never shows the navigation
 * bar, so a bar and a toolbar cannot fight for the same edge.
 */
export function PlannerPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPlace, setOriginPlace] = useState<ChosenPlace | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<ChosenPlace | null>(null);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [departureMode, setDepartureMode] = useState<"now" | "at">("now");
  const [departureTime, setDepartureTime] = useState(() =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const [stage, setStage] = useState<MapStage>(initialStage);
  const [tab, setTab] = useState<AppTab>(initialTab);
  const [details, setDetails] = useState<DetailRoute[]>([]);
  const [inboxOpen, setInboxOpen] = useState(initialInbox);
  const [inboxReadIds, setInboxReadIds] = useState<string[]>(() => readInboxReadIds());
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [pendingDetail, setPendingDetail] = useState<{
    origin: string;
    destination: string;
    lineCodes: string[];
  } | null>(null);
  const [homeModeFilter, setHomeModeFilter] = useState<HomeModeFilter>("all");
  const [sortMode, setSortMode] = useState<RouteSortMode>("fastest");
  const [tripStartedAt, setTripStartedAt] = useState<string | null>(null);
  const [greeting] = useState(() => greetingOf(new Date()));

  const account = useAccount();
  const queryClient = useQueryClient();
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
  const currentPlace = useCurrentPlace();
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
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { theme, toggle: toggleTheme } = useTheme();

  const [walk, setWalk] = useState<PositionPlan | null>(null);
  const [walkError, setWalkError] = useState<string | null>(null);
  const walkPlan = useWalkMutation({
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

  const network = useQuery({
    queryKey: ["network-overview"],
    queryFn: api.networkOverview,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const jpos = useQuery({
    queryKey: ["jpo-registry"],
    queryFn: api.jpos,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const watch = useQuery({
    queryKey: ["disruptions"],
    queryFn: api.disruptions,
    refetchInterval: 60_000,
    retry: false,
  });

  const lineList = useQuery({
    queryKey: ["line-list"],
    queryFn: () => api.lines(),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const topDetail = details[details.length - 1] ?? null;
  const activeLineId = topDetail?.kind === "line" ? topDetail.lineId : null;
  const lineDetail = useQuery({
    queryKey: ["line-detail", activeLineId ?? "none"],
    queryFn: ({ signal }) => {
      if (!activeLineId) throw new Error("No line");
      return api.line(activeLineId, signal);
    },
    enabled: activeLineId !== null,
    retry: false,
  });

  const followedLines = useFollowedLines();
  const routines = readRoutines();
  const inboxItems = useMemo(
    () =>
      buildInboxItems({
        notices: watch.data ?? [],
        personalAlerts: personalAlerts.data?.alerts ?? [],
        routines,
        readIds: inboxReadIds,
      }),
    [watch.data, personalAlerts.data, routines, inboxReadIds],
  );
  const unreadCount = unreadInboxCount(inboxItems);
  const noticeById = (id: string): DisruptionSummary | null =>
    (watch.data ?? []).find((notice) => notice.id === id) ?? null;

  const [hiddenSystems, setHiddenSystems] = useState<ReadonlySet<string>>(() => new Set());
  const visibleSystems = useMemo(
    () => NETWORK_SYSTEMS.map((entry) => entry.id).filter((id) => !hiddenSystems.has(id)),
    [hiddenSystems],
  );
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
  const [focus, setFocus] = useState<{
    id: string;
    token: string;
    planKey: string;
    points: { latitude: number; longitude: number }[];
    lineId: string | null;
  } | null>(null);
  const noticeToken = useRef(0);

  const planAt = departureMode === "at" ? departureAt(departureTime) : undefined;
  const plan = usePlan(submitted ? requestOf(submitted, planAt) : null);
  const planKey = plan.data?.computedAt ?? "";

  // A suggested route is the planner's own itinerary. Matching it by its
  // line codes lets the map open that choice without a second plan shape.
  const pendingIndex = useMemo(() => {
    if (!pendingDetail || !plan.data) return -1;
    if (
      plan.data.origin.text !== pendingDetail.origin ||
      plan.data.destination.text !== pendingDetail.destination
    ) {
      return -1;
    }
    return planChoices(plan.data).findIndex((route) => {
      const codes = route.legs
        .filter((leg) => leg.kind === "ride")
        .map((leg) => leg.lineCode)
        .filter((code): code is string => code !== null);
      return pendingDetail.lineCodes.every((code) => codes.includes(code));
    });
  }, [pendingDetail, plan.data]);

  const mapStage: MapStage = pendingIndex >= 0 ? "detail" : stage;

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

  useEffect(() => {
    if (!plan.data || !submitted) return;
    rememberJourney({
      originName: submitted.origin,
      destinationName: submitted.destination,
      origin: submitted.originPlace,
      destination: submitted.destinationPlace,
    });
  }, [plan.data, submitted, rememberJourney]);

  const activeFocus = focus && focus.planKey === planKey ? focus : null;

  const [selection, setSelection] = useState<{ key: string; index: number | null } | null>(null);
  const [legState, setLegState] = useState<{ key: string; leg: string | null }>({
    key: "",
    leg: null,
  });
  const [hoveredRouteLine, setHoveredRouteLine] = useState<string | null>(null);
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);
  const activeIndex =
    pendingIndex >= 0
      ? pendingIndex
      : selection && selection.key === planKey
        ? selection.index
        : plan.data
          ? firstOpenIndex(planChoices(plan.data), plan.data.disruptions)
          : null;
  const activeLeg = legState.key === planKey ? legState.leg : null;
  const choices = plan.data ? planChoices(plan.data) : [];
  const activeRoute = activeIndex === null ? undefined : choices[activeIndex];
  const watchedLines = (activeRoute?.legs ?? [])
    .filter((leg) => leg.kind === "ride" && leg.lineCode)
    .map((leg) => leg.lineCode as string);
  const watchKey =
    plan.data && watchedLines.length > 0
      ? `${plan.data.origin.stationId}>${plan.data.destination.stationId}:${watchedLines.join(",")}`
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

  const modeSuggestions = useMemo<MemorySuggestion[]>(() => {
    const named = namedPlaces.data?.places ?? [];
    const namedIds = new Set(named.map((entry) => entry.place.id));
    const savedRows = saved.filter((place) => !namedIds.has(place.id));
    const savedIds = new Set(saved.map((place) => place.id));
    return [
      ...named.map((entry) => ({
        id: `named:${entry.label}`,
        name: displayNameOf(entry.place),
        detail: entry.label,
        place: entry.place,
      })),
      ...savedRows.map((place) => ({
        id: place.id,
        name: displayNameOf(place),
        detail: "Saved",
        place,
      })),
      ...recentPlaces
        .filter((place) => !namedIds.has(place.id) && !savedIds.has(place.id))
        .map((place) => ({
          id: place.id,
          name: displayNameOf(place),
          detail: "Recent",
          place,
        })),
    ];
  }, [namedPlaces.data, saved, recentPlaces]);

  const quickPlaces = useMemo<HomeQuickPlace[]>(() => {
    const named = (namedPlaces.data?.places ?? []).slice(0, 4).map((entry) => ({
      label: entry.label,
      detail: displayNameOf(entry.place),
      place: entry.place,
    }));
    const namedIds = new Set((namedPlaces.data?.places ?? []).map((entry) => entry.place.id));
    const savedShortcuts = saved
      .filter((place) => !namedIds.has(place.id))
      .slice(0, 2)
      .map((place) => ({
        label: displayNameOf(place),
        detail: "Tersimpan",
        place,
      }));
    return [...named, ...savedShortcuts];
  }, [namedPlaces.data, saved]);

  const featuredPair = useMemo<FeaturedPair>(() => {
    const alert = personalAlerts.data?.alerts[0];
    if (alert) {
      return {
        originName: alert.habit.originName,
        destinationName: alert.habit.destinationName,
        origin: null,
        destination: null,
        reason: "alert",
        alertCount: alert.notices.length,
      };
    }
    const recent = riderMemory.journeys[0];
    if (recent) {
      return {
        originName: recent.originName,
        destinationName: recent.destinationName,
        origin: recent.origin,
        destination: recent.destination,
        reason: "recent",
        alertCount: 0,
      };
    }
    return {
      originName: "Bundaran HI",
      destinationName: "Kota",
      origin: null,
      destination: null,
      reason: "example",
      alertCount: 0,
    };
  }, [personalAlerts.data, riderMemory.journeys]);

  const featuredPlan = useQuery({
    queryKey: [
      "home-featured",
      featuredPair.originName,
      featuredPair.destinationName,
      featuredPair.origin?.id ?? "",
      featuredPair.destination?.id ?? "",
    ],
    queryFn: () =>
      api.plan(
        requestOf(
          {
            origin: featuredPair.originName,
            destination: featuredPair.destinationName,
            originPlace: featuredPair.origin,
            destinationPlace: featuredPair.destination,
          },
          undefined,
        ),
      ),
    enabled:
      stage === "home" &&
      tab === "map" &&
      (account.user === null || !personalAlerts.isLoading) &&
      featuredPair.originName.trim().length > 1 &&
      featuredPair.destinationName.trim().length > 1,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const featured: HomeFeatured = {
    ...featuredPair,
    plan: featuredPlan.data,
    loading: featuredPlan.isFetching,
  };

  const activeNotices = (watch.data ?? []).filter((notice) => notice.activeNow).length;
  const personalAlertCount = personalAlerts.data?.alerts.length ?? 0;
  const noticeHeadline =
    personalAlerts.data?.alerts[0]?.notices[0]?.title ??
    (watch.data ?? []).find((notice) => notice.activeNow)?.title ??
    null;

  const pushDetail = (route: DetailRoute): void => {
    setDetails((current) => [...current, route]);
  };
  const popDetail = (): void => {
    setDetails((current) => current.slice(0, -1));
  };
  const openChat = (): void => {
    setDetails([]);
    setPendingDetail(null);
    setInboxOpen(false);
    setTab("chat");
  };
  const openChatWith = (prompt: string): void => {
    setChatPrompt(prompt);
    setDetails([]);
    setPendingDetail(null);
    setInboxOpen(false);
    setTab("chat");
  };
  const openInbox = (): void => {
    setDetails([]);
    setInboxOpen(true);
    setTab("chat");
  };
  const closeChat = (): void => {
    setInboxOpen(false);
    setTab("map");
  };
  const closeAccount = (): void => setTab("map");
  const openNotices = (): void => {
    const first =
      (watch.data ?? []).find((notice) => notice.activeNow) ??
      (personalAlerts.data?.alerts[0]?.notices[0]
        ? noticeById(personalAlerts.data.alerts[0].notices[0].id)
        : null);
    if (first) {
      pushDetail({ kind: "notice", noticeId: first.id });
      return;
    }
    openInbox();
  };

  const changeTab = (id: string): void => {
    setDetails([]);
    setPendingDetail(null);
    if (id !== "chat") setInboxOpen(false);
    if (id === "lines") {
      setTab("lines");
      return;
    }
    if (id === "chat") {
      openChat();
      return;
    }
    if (id === "me") {
      setTab("me");
      return;
    }
    setTab("map");
  };

  const navItems: M3NavigationItem[] = [
    { id: "map", label: "Peta", icon: <MapIcon aria-hidden /> },
    {
      id: "lines",
      label: "Jalur",
      icon: <RouteIcon aria-hidden />,
      ...(activeNotices > 0 ? { badge: activeNotices } : {}),
    },
    { id: "chat", label: "Tanya", icon: <MessageSquare aria-hidden /> },
    { id: "me", label: "Saya", icon: <UserRound aria-hidden /> },
  ];

  const hideNav =
    details.length > 0 ||
    (tab === "map" &&
      (mapStage === "search" ||
        mapStage === "detail" ||
        mapStage === "live" ||
        mapStage === "arrived"));

  const signOutAccount = async (): Promise<void> => {
    await account.signOut();
    resetLocal();
  };
  const deleteAccount = async (password: string): Promise<void> => {
    await account.deleteAccount(password);
    resetLocal();
  };
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

  const resetJourney = (): void => {
    setSubmitted(null);
    setWalk(null);
    setWalkError(null);
    setSelection(null);
    setLegState({ key: "", leg: null });
    setTripStartedAt(null);
    setPendingDetail(null);
    setDetails([]);
    setStage("home");
    setTab("map");
  };

  const submit = (submission: Submission): void => {
    setPendingDetail(null);
    setOrigin(submission.origin);
    setDestination(submission.destination);
    setOriginPlace(submission.originPlace);
    setDestinationPlace(submission.destinationPlace);
    setWalk(null);
    setWalkError(null);
    setSelection(null);
    setSubmitted(submission);
    setTripStartedAt(null);
    setDetails([]);
    setStage("choices");
    setTab("map");
  };

  const startFeatured = (): void => {
    submit({
      origin: featuredPair.originName,
      destination: featuredPair.destinationName,
      originPlace: featuredPair.origin,
      destinationPlace: featuredPair.destination,
    });
  };

  const openSearch = (): void => {
    setStage("search");
    setTab("map");
  };

  const chooseFeaturedDeparture = (): void => {
    setOrigin(featuredPair.originName);
    setDestination(featuredPair.destinationName);
    setOriginPlace(featuredPair.origin);
    setDestinationPlace(featuredPair.destination);
    setDepartureMode("at");
    setStage("search");
    setTab("map");
  };

  const pickQuickPlace = (quick: HomeQuickPlace): void => {
    setDestination(displayNameOf(quick.place));
    setDestinationPlace(quick.place);
    rememberPlace(quick.place);
    setStage("search");
    setTab("map");
  };

  const startFromMyPosition = async (): Promise<void> => {
    setWalkError(null);
    const result = await currentPlace.locate();
    if (!result.ok) {
      setWalkError(result.error);
      return;
    }
    const here = result.place;
    const hereName = displayNameOf(here);
    setOrigin(hereName);
    setOriginPlace(here);
    rememberPlace(here);
    setWalk(null);
    setWalkError(null);
    if (destination.trim().length <= 1) return;
    setSelection(null);
    setSubmitted({
      origin: hereName,
      destination: destination.trim(),
      originPlace: here,
      destinationPlace,
    });
    setStage("choices");
    walkPlan.mutate({
      coordinates: { latitude: here.latitude, longitude: here.longitude },
      destination: destination.trim(),
    });
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
      setTab("map");
      setStage("home");
      return;
    }
    if (action.type === "show_stop") {
      setGlance({
        id: action.stationId,
        token: `${action.stationId}:${Date.now()}`,
        longitude: action.longitude,
        latitude: action.latitude,
      });
      setTab("map");
      setStage("home");
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
      setStage("search");
      setTab("map");
      return;
    }
    submit({
      origin: action.origin,
      destination: action.destination,
      originPlace: null,
      destinationPlace: null,
    });
  };

  const { legs: mapLegs, markers } = useMemo(() => {
    const data = plan.data;
    const originIsPlace = submitted?.originPlace?.kind === "place";
    const destinationIsPlace = submitted?.destinationPlace?.kind === "place";
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
    if (!data) return { legs: [] as MapLeg[], markers: incidents };

    const routeChoices = planChoices(data);
    const primary = activeIndex === null ? undefined : routeChoices[activeIndex];

    const lineColors = lineColorsOf(routeChoices);
    const legs: MapLeg[] = [];
    for (const [index, leg] of (primary?.legs ?? []).entries()) {
      if (leg.geometry.length < 2) continue;
      const key = lineKeyOf(leg);
      const id = legIdOf(leg, index);
      const routeText = `${leg.fromName} → ${leg.toName}`;
      legs.push({
        id,
        highlighted: activeLeg === id,
        hovered: hoveredRouteLine === key,
        coordinates: leg.geometry,
        color:
          leg.kind === "walk"
            ? ROUTE_WALK_COLOR
            : (lineColors.get(leg.lineId ?? "") ?? "var(--ink-2)"),
        width: leg.kind === "walk" ? 3 : (MODE_WIDTH[leg.mode] ?? 4),
        kind: leg.kind,
        lineKey: key,
        serviceClass: leg.serviceClass,
        systemId: leg.lineId ? (leg.lineId.split(":")[0] ?? null) : null,
        label:
          leg.kind === "walk"
            ? "Jalan"
            : (leg.lineName ?? leg.lineCode ?? "Transit"),
        detail:
          leg.kind === "walk"
            ? `${routeText} · ${formatDuration(leg.durationMinutes)} · ${formatDistance(leg.distanceKm)}`
            : `${routeText} · ${formatDuration(leg.durationMinutes)}`,
        order: index + 1,
      });
    }

    if (walk?.walk && walk.stationName) {
      legs.unshift({
        id: "walk-from-here",
        hovered: hoveredRouteLine === "walk",
        coordinates: walk.walk.geometry,
        color: ROUTE_WALK_COLOR,
        width: 3,
        kind: "walk",
        lineKey: "walk",
        label: `Jalan ke ${walk.stationName}`,
        detail: `${formatDuration(walk.walk.durationMinutes)} · ${formatDistance(walk.walk.distanceKm)}`,
        order: 0,
      });
    }

    const firstRide = legs.find((leg) => leg.kind === "ride");
    const lastRide = [...legs].reverse().find((leg) => leg.kind === "ride");
    const endpointsMeet =
      Math.abs(data.origin.latitude - data.destination.latitude) < 0.00005 &&
      Math.abs(data.origin.longitude - data.destination.longitude) < 0.00005;
    const markers: MapMarker[] = endpointsMeet
      ? [
          {
            id: "endpoints",
            latitude: data.origin.latitude,
            longitude: data.origin.longitude,
            label:
              data.origin.name === data.destination.name
                ? data.origin.name
                : `${data.origin.name} / ${data.destination.name}`,
            detail: "Dari dan ke",
            kind: "endpoint",
            systemId: originIsPlace ? null : data.origin.systemId || null,
            order: 1,
            pair: { from: data.origin.name, to: data.destination.name },
          },
        ]
      : [
          {
            id: "origin",
            latitude: data.origin.latitude,
            longitude: data.origin.longitude,
            label: data.origin.name,
            detail: "Dari",
            kind: "origin",
            systemId: originIsPlace ? null : (data.origin.systemId || firstRide?.systemId || null),
            order: 1,
          },
        ];

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
          ? `Transit ke ${leg.nextLineName ?? "kendaraan berikutnya"}`
          : leg.walkReason === "access"
            ? "Jalan ke kendaraan pertama"
            : "Jalan dari kendaraan terakhir",
        kind: isTransfer ? "transfer" : "stop",
        systemId: nextRide?.lineId?.split(":")[0] ?? null,
        order: index + 1,
      });
    }

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

    if (!endpointsMeet) {
      markers.push({
        id: "destination",
        latitude: data.destination.latitude,
        longitude: data.destination.longitude,
        label: data.destination.name,
        detail: "Tujuan",
        kind: "destination",
        systemId: destinationIsPlace
          ? null
          : (data.destination.systemId || lastRide?.systemId || null),
        order: (primary?.legs.length ?? 0) + 1,
      });
    }

    return { legs, markers };
  }, [
    plan.data,
    activeIndex,
    activeLeg,
    hoveredRouteLine,
    walk,
    watch.data,
    glance,
    activeFocus,
    submitted,
  ]);

  const mapNetwork = useMemo(() => {
    const lines = (network.data?.lines ?? []) as NetworkStroke[];
    return plan.data ? lines.filter((line) => line.tier === "primary") : lines;
  }, [network.data, plan.data]);
  const mapPlaces = plan.data ? [] : (network.data?.places ?? []);

  const activeJpos = useMemo(() => {
    const ids = new Set<string>();
    const routeChoices = plan.data ? planChoices(plan.data) : [];
    const primary = activeIndex === null ? undefined : routeChoices[activeIndex];
    for (const leg of primary?.legs ?? []) {
      for (const bridge of leg.jpo ?? []) ids.add(bridge.id);
    }
    for (const bridge of walk?.walk?.jpo ?? []) ids.add(bridge.id);
    if (ids.size === 0) return [];
    return (jpos.data?.jpos ?? []).filter((bridge) => ids.has(bridge.id));
  }, [plan.data, activeIndex, walk, jpos.data]);

  const originName = plan.data?.origin.name ?? submitted?.origin ?? origin;
  const destinationName = plan.data?.destination.name ?? submitted?.destination ?? destination;
  const departureLabel =
    departureMode === "at"
      ? `Berangkat ${departureTime} WIB`
      : "Berangkat sekarang";
  const lineLabel =
    (activeRoute?.legs ?? [])
      .filter((leg) => leg.kind === "ride" && leg.lineCode)
      .map((leg) => leg.lineCode as string)
      .filter((code, index, all) => all.indexOf(code) === index)
      .join(" · ") || "Perjalanan";

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-bg">
      <div className="m3-rail-offset relative h-full min-h-0">
        <RouteMap
          legs={mapLegs}
          markers={markers}
          theme={theme}
          highlightedStationId={hoveredStation}
          network={mapNetwork}
          platforms={(network.data?.platforms ?? []) as NetworkPlatform[]}
          jpos={activeJpos}
          places={mapPlaces}
          visibleSystems={visibleSystems}
          dimmedSystemFilter={
            tab === "map" && mapStage === "home" ? homeModeFilter : null
          }
          glance={glance}
          focus={activeFocus}
          onMarkerClick={(marker) => {
            const routeChoices = plan.data ? planChoices(plan.data) : [];
            const primary = activeIndex === null ? undefined : routeChoices[activeIndex];
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
        <p className="pointer-events-none absolute right-2 bottom-[calc(80px+env(safe-area-inset-bottom)+6px)] z-10 text-[12px] leading-[1.35] text-ink-3 lg:bottom-2">
          © OpenStreetMap · OpenFreeMap
        </p>

        {tab === "map" && mapStage === "home" ? (
          <MapHomeOverlay
            desktop={isDesktop}
            modeFilter={homeModeFilter}
            onModeFilterChange={setHomeModeFilter}
            noticeCount={activeNotices}
            personalAlertCount={personalAlertCount}
            noticeHeadline={noticeHeadline}
            onOpenNotices={openNotices}
            greeting={greeting}
            riderName={account.user?.email.split("@")[0] ?? "Komuter"}
            onOpenProfile={() => setTab("me")}
            onOpenSearch={openSearch}
            theme={theme}
            onToggleTheme={toggleTheme}
            featured={featured}
            onStartFeatured={startFeatured}
            onOpenChoices={startFeatured}
            onChooseDeparture={chooseFeaturedDeparture}
            onOpenChat={openChat}
            quickPlaces={quickPlaces}
            onPickQuickPlace={pickQuickPlace}
          />
        ) : null}

        {tab === "map" && mapStage === "search" ? (
          <SearchScreen
            origin={origin}
            destination={destination}
            onOriginChange={(value) => {
              setOrigin(value);
              setOriginPlace((current) =>
                current && displayNameOf(current) === value ? current : null,
              );
            }}
            onDestinationChange={(value) => {
              setDestination(value);
              setDestinationPlace((current) =>
                current && displayNameOf(current) === value ? current : null,
              );
            }}
            onSelectOrigin={(place) => {
              setOrigin(displayNameOf(place));
              setOriginPlace(place);
              rememberPlace(place);
            }}
            onSelectDestination={(place) => {
              setDestination(displayNameOf(place));
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
            memory={modeSuggestions}
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
            }}
            onSubmit={() => {
              submit({
                origin: origin.trim(),
                destination: destination.trim(),
                originPlace,
                destinationPlace,
              });
            }}
            locating={currentPlace.locating}
            onUseMyPosition={() => void startFromMyPosition()}
            walkError={walkError}
            quickPlaces={quickPlaces}
            onPickQuickPlace={pickQuickPlace}
            onOpenChat={openChat}
            onBack={() => setStage(plan.data && submitted ? "choices" : "home")}
          />
        ) : null}

        {tab === "map" && mapStage === "choices" ? (
          <RouteChoicesView
            plan={plan}
            originName={originName}
            destinationName={destinationName}
            departureLabel={departureLabel}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            activeIndex={activeIndex}
            onOpenRoute={(index) => {
              setPendingDetail(null);
              setActiveIndex(index);
              setStage("detail");
            }}
            onEdit={() => setStage("search")}
            onClose={resetJourney}
            onAsk={openChat}
            onRetry={() =>
              setSubmitted((current) => (current ? { ...current } : null))
            }
          />
        ) : null}

        {tab === "map" && mapStage === "detail" && plan.data && activeRoute ? (
          <RouteDetailView
            plan={plan.data}
            route={activeRoute}
            activeLeg={activeLeg}
            onLegSelect={setActiveLeg}
            onStopHover={setHoveredStation}
            hoveredLine={hoveredRouteLine}
            onHoverLine={setHoveredRouteLine}
            watching={watching}
            onToggleWatch={toggleWatchTrip}
            onBack={() => {
              setPendingDetail(null);
              setStage("choices");
            }}
            onStart={() => {
              setPendingDetail(null);
              setTripStartedAt(new Date().toISOString());
              setStage("live");
            }}
            onAsk={openChat}
          />
        ) : null}

        {tab === "map" && mapStage === "live" && plan.data && activeRoute ? (
          <LiveTripView
            route={activeRoute}
            lineLabel={lineLabel}
            originName={plan.data.origin.name}
            destinationName={plan.data.destination.name}
            onEnd={() => setStage("detail")}
            onComplete={() => setStage("arrived")}
            onAsk={openChat}
          />
        ) : null}

        {tab === "map" && mapStage === "arrived" && plan.data && activeRoute ? (
          <ArrivedView
            originName={plan.data.origin.name}
            destinationName={plan.data.destination.name}
            origin={submitted?.originPlace ?? null}
            destination={submitted?.destinationPlace ?? null}
            route={activeRoute}
            elapsedMinutes={minutesSince(tripStartedAt, activeRoute.durationMinutes)}
            departureTime={departureMode === "at" ? departureTime : null}
            onDone={resetJourney}
          />
        ) : null}
      </div>

      <M3NavigationRail
        active={tab}
        items={navItems}
        onChange={changeTab}
        ariaLabel="Navigasi utama"
        className="fixed inset-y-0 left-0 z-50"
      />

      {!hideNav ? (
        <M3NavigationBar
          active={tab}
          items={navItems}
          onChange={changeTab}
          ariaLabel="Navigasi utama"
          className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        />
      ) : null}

      {tab === "lines" ? (
        <LineStatusView
          lines={lineList.data ?? []}
          notices={watch.data ?? []}
          loading={lineList.isPending}
          error={lineList.isError}
          followed={followedLines.followed}
          unreadCount={unreadCount}
          hiddenSystems={hiddenSystems}
          onToggleSystem={toggleSystem}
          onOpenLine={(lineId) => pushDetail({ kind: "line", lineId })}
          onOpenInbox={openInbox}
          onRetry={() => void lineList.refetch()}
        />
      ) : null}

      {tab === "chat" ? (
        <>
          <div hidden={inboxOpen}>
            <ChatPanel
              onClose={closeChat}
              onAction={runChatAction}
              onOpenInbox={openInbox}
              unreadCount={unreadCount}
              onOpenNotice={(noticeId) => pushDetail({ kind: "notice", noticeId })}
              initialPrompt={chatPrompt}
              onInitialPromptConsumed={() => setChatPrompt(null)}
              origin={
                currentPlace.place && origin.trim() === displayNameOf(currentPlace.place)
                  ? undefined
                  : origin.trim() || undefined
              }
              destination={destination.trim() || undefined}
              at={planAt}
              places={modeSuggestions}
              currentPlace={currentPlace.place}
            />
          </div>
          {inboxOpen ? (
            <InboxView
              notices={watch.data ?? []}
              personalAlerts={personalAlerts.data?.alerts ?? []}
              routines={routines}
              loading={watch.isPending}
              error={watch.isError}
              refreshing={watch.isFetching}
              readIds={inboxReadIds}
              onReadIdsChange={setInboxReadIds}
              onBack={() => setInboxOpen(false)}
              onOpenNotice={(noticeId) => pushDetail({ kind: "notice", noticeId })}
              onOpenRoutine={(routineId) => {
                const routine = routines.find((entry) => entry.id === routineId);
                if (!routine) return;
                submit({
                  origin: routine.originName,
                  destination: routine.destinationName,
                  originPlace: routine.origin,
                  destinationPlace: routine.destination,
                });
              }}
              onRefresh={() => {
                void watch.refetch();
                void personalAlerts.refetch();
              }}
            />
          ) : null}
        </>
      ) : null}

      {tab === "me" ? (
        <div className="pointer-events-none fixed inset-x-2 bottom-[calc(80px+env(safe-area-inset-bottom)+8px)] top-[calc(env(safe-area-inset-top)+8px)] z-40 flex flex-col justify-end lg:inset-auto lg:bottom-4 lg:right-4 lg:top-4 lg:w-[400px] chat-sheet-in">
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
            onUseCurrentLocation={currentPlace.locate}
            onClose={closeAccount}
          />
        </div>
      ) : null}

      {topDetail?.kind === "line" ? (
        <LineDetailView
          line={lineDetail.data ?? null}
          loading={lineDetail.isPending}
          error={lineDetail.isError}
          notices={watch.data ?? []}
          followed={followedLines.isFollowed(topDetail.lineId)}
          onToggleFollow={() => followedLines.toggle(topDetail.lineId)}
          onBack={popDetail}
          onOpenNotice={(noticeId) => pushDetail({ kind: "notice", noticeId })}
          onOpenStation={(stationId) => pushDetail({ kind: "station", stationId })}
          onRetry={() => void lineDetail.refetch()}
        />
      ) : null}

      {topDetail?.kind === "station" ? (
        <StationDetailView
          stationId={topDetail.stationId}
          onBack={popDetail}
          onOpenLine={(lineId) => pushDetail({ kind: "line", lineId })}
          onPlanFrom={(name) => {
            setOrigin(name);
            setOriginPlace(null);
            setDetails([]);
            setStage("search");
            setTab("map");
          }}
          onPlanTo={(name) => {
            setDestination(name);
            setDestinationPlace(null);
            setDetails([]);
            setStage("search");
            setTab("map");
          }}
          onShowOnMap={(station) => {
            setGlance({
              id: station.id,
              token: `${station.id}:${Date.now()}`,
              latitude: station.latitude,
              longitude: station.longitude,
            });
            setDetails([]);
            setStage("home");
            setTab("map");
          }}
        />
      ) : null}

      {topDetail?.kind === "notice" ? (
        <DisruptionDetailView
          notice={noticeById(topDetail.noticeId)}
          loading={watch.isPending}
          error={watch.isError}
          personalAlerts={personalAlerts.data?.alerts ?? []}
          routines={routines}
          onBack={popDetail}
          onOpenAlternatives={() =>
            pushDetail({ kind: "alternatives", noticeId: topDetail.noticeId })
          }
          onShowOnMap={() => {
            const notice = noticeById(topDetail.noticeId);
            if (notice) showNotice(notice);
            setDetails([]);
            setStage("home");
            setTab("map");
          }}
          onAsk={openChatWith}
          onRetry={() => void watch.refetch()}
        />
      ) : null}

      {topDetail?.kind === "alternatives" ? (
        <AlternativeRouteView
          notice={noticeById(topDetail.noticeId)}
          journey={
            plan.data
              ? {
                  originName: plan.data.origin.name,
                  destinationName: plan.data.destination.name,
                  origin: {
                    kind: "station",
                    id: plan.data.origin.stationId,
                    name: plan.data.origin.name,
                    latitude: plan.data.origin.latitude,
                    longitude: plan.data.origin.longitude,
                  },
                  destination: {
                    kind: "station",
                    id: plan.data.destination.stationId,
                    name: plan.data.destination.name,
                    latitude: plan.data.destination.latitude,
                    longitude: plan.data.destination.longitude,
                  },
                }
              : null
          }
          personalAlerts={personalAlerts.data?.alerts ?? []}
          routines={routines}
          onBack={popDetail}
          onUseRoute={(journey, lineCodes) => {
            submit({
              origin: journey.originName,
              destination: journey.destinationName,
              originPlace: journey.origin,
              destinationPlace: journey.destination,
            });
            setPendingDetail({
              origin: journey.originName,
              destination: journey.destinationName,
              lineCodes,
            });
          }}
          onAsk={openChatWith}
          onShowOnMap={() => {
            const notice = noticeById(topDetail.noticeId);
            if (notice) showNotice(notice);
            setDetails([]);
            setStage("home");
            setTab("map");
          }}
        />
      ) : null}
    </div>
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
