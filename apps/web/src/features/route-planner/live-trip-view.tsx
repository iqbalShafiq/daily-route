import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Check,
  LocateFixed,
  MessageSquare,
  Navigation,
  Share2,
  X,
} from "lucide-react";

import {
  M3Button,
  M3Card,
  M3CircularWavyProgress,
  M3FloatingToolbar,
  M3IconButton,
  M3Shape,
  M3Snackbar,
  M3Switch,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
import type { Itinerary } from "../../lib/api.js";
import { usePwa } from "../pwa/index.js";

import {
  distanceMeters,
  flattenTripStops,
  stopsRemainingBeforeAlight,
  tripStopNoun,
} from "./live-trip.js";

/**
 * Perjalanan live.
 *
 * The screen follows the real stops of the chosen itinerary, one index at
 * a time. The position watcher is an optional convenience: when the next
 * stop is within 180 metres the tracker steps forward, and the rider can
 * always step by hand. The wake alarm only repeats what the itinerary
 * already knows: one stop before the place where the rider has to move.
 */
export function LiveTripView({
  route,
  lineLabel,
  originName,
  destinationName,
  onEnd,
  onComplete,
  onAsk,
}: {
  route: Itinerary;
  lineLabel: string;
  originName: string;
  destinationName: string;
  onEnd: () => void;
  onComplete: () => void;
  onAsk: () => void;
}) {
  const stops = useMemo(() => flattenTripStops(route), [route]);
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState(false);
  const [wake, setWake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pwa = usePwa();
  const notified = useRef<string | null>(null);

  const progress = stopsRemainingBeforeAlight(stops, index);
  const current = stops[Math.min(index, Math.max(0, stops.length - 1))];
  const noun = tripStopNoun(current?.mode ?? "brt");
  const lastIndex = Math.max(0, stops.length - 1);
  const remainingMinutes =
    progress.remainingStops === 0
      ? 0
      : Math.max(
          1,
          Math.round(
            (route.durationMinutes * progress.remainingStops) / Math.max(lastIndex, 1),
          ),
        );
  const wakeStop = progress.nextIsTransfer ? progress.nextStopName : progress.alightStopName;

  useEffect(() => {
    if (!follow || typeof navigator === "undefined" || !navigator.geolocation) return;
    const next = stops[index + 1];
    if (!next) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const distance = distanceMeters(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          next,
        );
        if (distance <= 180) {
          setIndex((currentIndex) => Math.min(currentIndex + 1, lastIndex));
        }
      },
      () => {
        setFollow(false);
        setMessage("Posisi tidak bisa dibaca. Gunakan tombol perhentian berikutnya.");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [follow, index, stops, lastIndex]);

  useEffect(() => {
    if (!wake || !progress.shouldWakeNow || wakeStop.length === 0) return;
    const key = `${index}:${wakeStop}`;
    if (notified.current === key) return;
    notified.current = key;
    const title = progress.nextIsTransfer
      ? `Bersiap transit di ${wakeStop}`
      : `Siap turun di ${wakeStop}`;
    void pwa.sendLocalNotification({
      title,
      body: "1 pemberhentian lagi sebelum tujuanmu.",
      tag: "daily-wake-alarm",
    });
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([140, 60, 140]);
    }
  }, [wake, progress.shouldWakeNow, progress.nextIsTransfer, wakeStop, index, pwa]);

  const toggleWake = async (checked: boolean): Promise<void> => {
    if (!checked) {
      setWake(false);
      return;
    }
    const status = pwa.notificationCapability.status;
    if (status === "needs-ios-install") {
      pwa.openInstallSheet();
      setWake(false);
      return;
    }
    if (status === "prompt") {
      const result = await pwa.requestNotificationPermission();
      if (result !== "granted") {
        setWake(false);
        setMessage(pwa.notificationCapability.explanation);
        return;
      }
    }
    if (status === "denied" || status === "unsupported") {
      setWake(false);
      setMessage(pwa.notificationCapability.explanation);
      return;
    }
    setWake(true);
    setMessage("Pengingat turun aktif untuk perjalanan ini.");
  };

  const share = async (): Promise<void> => {
    const text = `Perjalanan live: ${originName} ke ${destinationName} · ${progress.remainingStops} ${noun} lagi${
      progress.alightStopName ? ` · turun di ${progress.alightStopName}` : ""
    }`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "Daily Route", text });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setMessage("Ringkasan perjalanan disalin.");
        return;
      }
      setMessage("Perangkat ini tidak bisa membagikan perjalanan.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Perjalanan tidak bisa dibagikan sekarang.");
    }
  };

  return (
    <section
      aria-label="Perjalanan live"
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-m3-surface text-m3-on-surface",
        "pt-[env(safe-area-inset-top)] pb-[calc(104px+env(safe-area-inset-bottom))]",
        "lg:inset-y-0 m3-stage-panel lg:right-auto lg:w-[420px] lg:border-r lg:border-m3-outline-variant",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <M3IconButton label="Kembali ke detail rute" onClick={onEnd}>
          <X aria-hidden />
        </M3IconButton>
        <p className="m3-lm min-w-0 flex-1 truncate text-m3-on-surface-variant">
          LIVE · {lineLabel}
        </p>
      </div>

      <div className="m3-live-hero mx-4 grid justify-items-center gap-3 p-5 text-center">
        <M3Shape
          shape="cookie12"
          size={300}
          className="m3-live-hero__shape m3-spin-slow"
        />
        <M3CircularWavyProgress
          value={progress.progress}
          size={132}
          strokeWidth={7}
          label={`Sisa ${progress.remainingStops} ${noun} menuju ${progress.alightStopName}`}
          className="m3-live-ring"
        >
          <span className="grid justify-items-center gap-0">
            <span className="m3-lm">TURUN</span>
            <span className="m3-ds m3-em m3-num tabular-nums">
              {progress.remainingStops}
            </span>
            <span className="m3-bs">{noun} lagi</span>
          </span>
        </M3CircularWavyProgress>
        <div className="grid gap-1">
          <p className="m3-tm">{progress.alightStopName || destinationName}</p>
          <p className="m3-bs opacity-80">
            {progress.remainingStops === 0
              ? "Kamu sudah di perhentian tujuan"
              : `± ${remainingMinutes} mnt lagi`}
          </p>
        </div>
      </div>

      <div className="mt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="m3-lm text-m3-on-surface-variant">Perhentian</p>
          <p className="m3-bs m3-num tabular-nums text-m3-on-surface-variant">
            {Math.min(index + 1, stops.length)} / {stops.length || 0}
          </p>
        </div>
        <ol
          aria-label="Perhentian perjalanan"
          className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-2"
        >
          {stops.map((stop, stopIndex) => {
            const passed = stopIndex < index;
            const now = stopIndex === index;
            const transfer = stop.isTransfer;
            return (
              <li key={`${stop.stationId}-${stopIndex}`} className="flex min-w-16 flex-col items-center gap-1">
                <span
                  aria-current={now ? "step" : undefined}
                  className={cn(
                    "relative grid size-6 place-items-center rounded-full border-2",
                    passed
                      ? "border-m3-primary bg-m3-primary text-m3-on-primary"
                      : now
                        ? "border-m3-primary bg-m3-surface"
                        : "border-m3-outline-variant bg-m3-surface",
                  )}
                >
                  {passed ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        now ? "bg-m3-primary" : "bg-m3-outline-variant",
                      )}
                    />
                  )}
                  {now ? (
                    <span
                      aria-hidden
                      className="m3-pulse-ring absolute inset-0 rounded-full border-2 border-m3-primary"
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "m3-bs w-16 truncate text-center",
                    now
                      ? "font-semibold text-m3-on-surface"
                      : "text-m3-on-surface-variant",
                  )}
                  title={stop.name}
                >
                  {stop.name}
                </span>
                {transfer ? <span className="m3-bs text-m3-primary">Transit</span> : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-2 grid gap-3 px-4">
        <div className="flex flex-wrap gap-2">
          <M3Button
            variant="tonal"
            size="s"
            icon={<Navigation aria-hidden />}
            onClick={() => setIndex((currentIndex) => Math.min(currentIndex + 1, lastIndex))}
            disabled={index >= lastIndex}
          >
            {noun.charAt(0).toUpperCase()}
            {noun.slice(1)} berikutnya
          </M3Button>
          <M3Button
            variant={follow ? "filled" : "outlined"}
            size="s"
            icon={<LocateFixed aria-hidden />}
            onClick={() => setFollow((value) => !value)}
            aria-pressed={follow}
          >
            {follow ? "Mengikuti posisi" : "Ikuti posisi"}
          </M3Button>
        </div>

        <M3Card variant="filled" radius="xl" className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <M3Shape
                shape="softburst"
                size={40}
                className="bg-m3-primary text-m3-on-primary"
              >
                <BellRing aria-hidden className="size-5" />
              </M3Shape>
              <div className="grid gap-1">
                <p className="m3-tm">Bangunkan saya</p>
                <p className="m3-bs text-m3-on-surface-variant">
                  Getar dan bunyi 1 perhentian sebelum turun atau transit.
                </p>
              </div>
            </div>
            <M3Switch
              checked={wake}
              onCheckedChange={(checked) => void toggleWake(checked)}
              aria-label="Bangunkan saya satu perhentian sebelum turun"
            />
          </div>
          <p className="m3-bs text-m3-on-surface-variant">
            {wake
              ? `Aktif. Pengingat berbunyi di ${wakeStop || progress.alightStopName}.`
              : "Pengingat hanya berbunyi di perangkat ini. Ini bukan pelacakan kendaraan."}
          </p>
        </M3Card>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-2",
          "px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3",
          "bg-gradient-to-t from-m3-surface via-m3-surface/95 to-transparent",
          "m3-stage-panel lg:right-auto lg:w-[420px]",
        )}
      >
        <M3FloatingToolbar variant="standard" ariaLabel="Aksi perjalanan">
          <M3IconButton label="Akhiri perjalanan" onClick={onEnd}>
            <X aria-hidden />
          </M3IconButton>
          <M3IconButton label="Bagikan perjalanan" onClick={() => void share()}>
            <Share2 aria-hidden />
          </M3IconButton>
          <M3IconButton label="Tanya Daily" onClick={onAsk}>
            <MessageSquare aria-hidden />
          </M3IconButton>
        </M3FloatingToolbar>
        <M3Button variant="filled" size="s" icon={<Check aria-hidden />} onClick={onComplete}>
          Sampai
        </M3Button>
      </div>

      <M3Snackbar open={message !== null} message={message ?? ""} onDismiss={() => setMessage(null)} />
    </section>
  );
}
