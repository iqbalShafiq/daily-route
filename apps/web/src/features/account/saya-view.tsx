import {
  BellRing,
  ChevronRight,
  CreditCard,
  Download,
  LogIn,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  Settings,
  Sparkles,
  TrainFront,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  M3Button,
  M3Card,
  M3CircularWavyProgress,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Shape,
} from "../../components/m3e/index.js";
import type { AccountUser, NamedPlace } from "../../lib/api.js";
import { formatDuration, formatRupiah } from "../../lib/format.js";
import { usePwa } from "../pwa/index.js";
import type { ChosenPlace } from "../route-planner/place-memory.js";
import {
  readCompletedTrips,
  readRoutines,
  routineDaysOf,
  type RoutineRecord,
} from "../route-planner/live-trip.js";
import { AuthSheet } from "./auth-sheet.js";
import { CardBalanceView } from "./card-balance-view.js";
import { PlacesManagerView } from "./places-manager-view.js";
import { RoutinesView } from "./routines-view.js";
import { SettingsView } from "./settings-view.js";
import {
  computeMonthlyRecap,
  readTransitCard,
} from "./rider-preferences.js";
import type { LocateResult } from "../route-planner/use-current-place.js";
import type { MemorySuggestion } from "../route-planner/place-input.js";

export type SayaViewProps = {
  user: AccountUser | null;
  accountPending: boolean;
  places: readonly NamedPlace[];
  /** The stops this browser saved while signed out. */
  savedPlaces: readonly ChosenPlace[];
  followedLines: readonly string[];
  memoryError: string | null;
  memoryLoadFailed: boolean;
  memory: readonly MemorySuggestion[];
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onSavePlace: (label: string, place: NamedPlace["place"]) => Promise<void>;
  onRemovePlace: (label: string) => Promise<void>;
  onToggleSaved: (place: ChosenPlace) => void;
  onUseCurrentLocation: () => Promise<LocateResult>;
  onRetryMemory: () => void;
  onPlanRoutine: (routine: RoutineRecord) => void;
  onOpenFollowedLines: () => void;
  onOpenOnboarding: () => void;
  onOpenMap: () => void;
  onClose: () => void;
};

type SayaPane = "home" | "routines" | "places" | "card" | "settings" | "auth";

function initialsOf(email: string | null): string | null {
  if (!email) return null;
  const local = (email.split("@")[0] ?? "").trim();
  if (local.length === 0) return null;
  const parts = local.split(/[._-]/).filter((part) => part.length > 0);
  const letters =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : local.slice(0, 2);
  return letters.toUpperCase();
}

function nextArrival(routines: readonly RoutineRecord[]): string | null {
  const clocks = routines
    .map((routine) => routine.arriveBy)
    .filter((clock): clock is string => typeof clock === "string" && clock.length > 0)
    .sort();
  return clocks[0] ?? null;
}

function codesOf(followed: readonly string[]): string {
  const codes = followed
    .map((id) => id.split(":").pop() ?? id)
    .filter((code) => code.length > 0)
    .slice(0, 3);
  return codes.join(" · ");
}

/**
 * Saya.
 *
 * The rider's own surface: what this month looked like, the routines and
 * places they keep, the transit-card ledger, and the settings. Every
 * number is read from a record the browser or the account really has. A
 * month without journeys says so and offers the map, rather than a zero
 * dressed up as a statistic.
 */
export function SayaView({
  user,
  accountPending,
  places,
  savedPlaces,
  followedLines,
  memoryError,
  memoryLoadFailed,
  memory,
  onSignIn,
  onSignUp,
  onSignOut,
  onChangePassword,
  onDeleteAccount,
  onSavePlace,
  onRemovePlace,
  onToggleSaved,
  onUseCurrentLocation,
  onRetryMemory,
  onPlanRoutine,
  onOpenFollowedLines,
  onOpenOnboarding,
  onOpenMap,
  onClose,
}: SayaViewProps) {
  const pwa = usePwa();
  const [pane, setPane] = useState<SayaPane>("home");
  const [settingsAccount, setSettingsAccount] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const recap = useMemo(() => {
    // The month is read when the surface opens and after a journey has been
    // finished in another tab. `refreshToken` is what re-reads it.
    void refreshToken;
    return computeMonthlyRecap(readCompletedTrips());
  }, [refreshToken]);

  const routines = useMemo(() => {
    void refreshToken;
    return readRoutines();
  }, [refreshToken]);
  const card = useMemo(() => {
    void refreshToken;
    return readTransitCard();
  }, [refreshToken]);

  const activeRoutines = routines.filter(
    (routine) => routineDaysOf(routine).length > 0,
  ).length;
  const arrival = nextArrival(routines);
  const initials = initialsOf(user?.email ?? null);
  const placeLabels = places
    .slice(0, 3)
    .map((entry) => entry.label)
    .join(" · ");

  const openPane = (next: SayaPane): void => {
    setSettingsAccount(false);
    setRefreshToken((token) => token + 1);
    setPane(next);
  };

  const home = (): void => {
    setRefreshToken((token) => token + 1);
    setPane("home");
  };

  if (pane === "routines") {
    return (
      <RoutinesView
        memory={memory}
        onPlan={(routine) => {
          onPlanRoutine(routine);
        }}
        onBack={home}
      />
    );
  }

  if (pane === "places") {
    return (
      <PlacesManagerView
        user={user}
        places={places}
        savedPlaces={savedPlaces}
        memoryError={memoryError}
        memoryLoadFailed={memoryLoadFailed}
        onSavePlace={onSavePlace}
        onRemovePlace={onRemovePlace}
        onUseCurrentLocation={onUseCurrentLocation}
        onToggleSaved={onToggleSaved}
        onOpenAuth={() => openPane("auth")}
        onRetryMemory={onRetryMemory}
        onBack={home}
      />
    );
  }

  if (pane === "card") {
    return <CardBalanceView onBack={home} />;
  }

  if (pane === "settings") {
    return (
      <SettingsView
        user={user}
        accountPending={accountPending}
        onChangePassword={onChangePassword}
        onSignOut={onSignOut}
        onDeleteAccount={onDeleteAccount}
        onOpenAuth={() => openPane("auth")}
        onOpenOnboarding={onOpenOnboarding}
        initialAccount={settingsAccount}
        onBack={home}
      />
    );
  }

  if (pane === "auth") {
    return (
      <div className="m3-saya-view">
        <div className="m3-saya-view__scroll">
          <AuthSheet
            user={user}
            onSignIn={onSignIn}
            onSignUp={onSignUp}
            onSignedIn={home}
            onGuest={home}
            onClose={home}
          />
        </div>
      </div>
    );
  }

  const comfortPercent =
    recap.comfortShare === null ? 0 : Math.round(recap.comfortShare * 100);

  return (
    <div className="m3-saya-view">
      <header className="m3-saya-view__head">
        <div className="min-w-0 flex-1">
          <h1 className="m3-hm m3-em text-m3-on-surface">Saya</h1>
          <p className="m3-bs mt-1 text-m3-on-surface-variant">Profil dan pengaturan</p>
        </div>
        <M3IconButton label="Buka pengaturan" onClick={() => openPane("settings")}>
          <Settings aria-hidden />
        </M3IconButton>
        <M3IconButton label="Tutup Saya" onClick={onClose}>
          <X aria-hidden />
        </M3IconButton>
      </header>

      <div className="m3-saya-view__scroll">
        <div className="grid gap-4 px-4 pb-6">
          <section aria-label="Profil" className="flex items-center gap-4">
            <span className="m3-avatar-stack" aria-hidden>
              <M3Shape
                shape="cookie12"
                size={92}
                className="m3-avatar-stack__back bg-m3-tertiary-container"
              />
              <M3Shape
                shape="sunny"
                size={76}
                className="m3-avatar-stack__middle bg-m3-primary-container"
              />
              <M3Shape
                shape="cookie9"
                size={58}
                className="m3-avatar-stack__front bg-m3-primary text-m3-on-primary"
              >
                {initials ? (
                  <span className="m3-avatar-stack__initials">{initials}</span>
                ) : (
                  <UserRound aria-hidden className="size-6" />
                )}
              </M3Shape>
            </span>
            <div className="grid min-w-0 gap-2">
              <div className="min-w-0">
                <p className="m3-tl m3-em break-words text-m3-on-surface">
                  {user?.email.split("@")[0] ?? "Komuter Jabodetabek"}
                </p>
                <p className="m3-bs truncate text-m3-on-surface-variant">
                  {user?.email ?? "Belum masuk"}
                </p>
              </div>
              <M3Button
                variant="outlined"
                size="xs"
                icon={user ? undefined : <LogIn aria-hidden className="size-4" />}
                onClick={() => {
                  if (user) {
                    setSettingsAccount(true);
                    setPane("settings");
                    return;
                  }
                  openPane("auth");
                }}
              >
                {user ? "Ubah akun" : "Masuk"}
              </M3Button>
            </div>
          </section>

          <M3Card variant="secondary-container" radius="2xl" className="grid gap-4 p-5">
            <div className="flex items-center gap-4">
              <M3CircularWavyProgress
                value={comfortPercent / 100}
                size={76}
                strokeWidth={5}
                label={
                  recap.comfortShare === null
                    ? "Belum ada penilaian kenyamanan bulan ini"
                    : `${comfortPercent} persen perjalanan terasa nyaman`
                }
              >
                <span className="m3-tm tabular-nums">
                  {recap.comfortShare === null
                    ? "Belum"
                    : `${comfortPercent}%`}
                </span>
              </M3CircularWavyProgress>
              <div className="min-w-0 flex-1">
                <p className="m3-lm uppercase tracking-[0.08em]">Rekap bulan ini</p>
                <p className="m3-hs m3-em mt-1 tabular-nums">
                  {recap.totalTrips} perjalanan
                </p>
                <p className="m3-bs mt-1">
                  {recap.monthLabel}
                  {recap.ratedTrips > 0
                    ? `, ${recap.ratedTrips} dinilai`
                    : ", belum ada penilaian"}
                </p>
              </div>
            </div>

            {recap.totalTrips === 0 ? (
              <div className="grid gap-3">
                <p className="m3-bm">
                  Belum ada perjalanan yang selesai bulan ini. Selesaikan satu perjalanan
                  dari peta, lalu rekapnya muncul di sini.
                </p>
                <M3Button
                  variant="filled"
                  icon={<MapPin aria-hidden className="size-4" />}
                  onClick={onOpenMap}
                >
                  Buka peta
                </M3Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="m3-recap-cell">
                  <p className="m3-bs">Jalan kaki</p>
                  <p className="m3-ll tabular-nums">{recap.walkKm.toLocaleString("id-ID")} km</p>
                </div>
                <div className="m3-recap-cell">
                  <p className="m3-bs">Rata-rata</p>
                  <p className="m3-ll tabular-nums">
                    {recap.averageDurationMinutes === null
                      ? "-"
                      : formatDuration(recap.averageDurationMinutes)}
                  </p>
                </div>
                <div className="m3-recap-cell">
                  <p className="m3-bs">Paling sering</p>
                  <p className="m3-ll truncate" title={recap.topDestination?.name ?? undefined}>
                    {recap.topDestination?.name ?? "-"}
                  </p>
                </div>
              </div>
            )}
          </M3Card>

          <section aria-label="Pintasan" className="m3-bento">
            <button type="button" className="m3-bento__tile" onClick={() => openPane("routines")}>
              <M3Shape
                shape="cookie9"
                size={40}
                className="bg-m3-primary-container text-m3-on-primary-container"
              >
                <RouteIcon aria-hidden className="size-5" />
              </M3Shape>
              <span className="m3-bento__label">Rutinitas</span>
              <span className="m3-bento__value tabular-nums">
                {activeRoutines === 0 ? "Belum ada" : `${activeRoutines} aktif`}
              </span>
              <span className="m3-bento__hint">
                {arrival ? `Tiba ${arrival}` : "Atur jam berangkat"}
              </span>
            </button>

            <button type="button" className="m3-bento__tile" onClick={() => openPane("places")}>
              <M3Shape
                shape="sunny"
                size={40}
                className="bg-m3-secondary-container text-m3-on-secondary-container"
              >
                <MapPin aria-hidden className="size-5" />
              </M3Shape>
              <span className="m3-bento__label">Tempat</span>
              <span className="m3-bento__value tabular-nums">
                {user
                  ? `${places.length} tempat`
                  : `${savedPlaces.length} disimpan`}
              </span>
              <span className="m3-bento__hint truncate">
                {user
                  ? placeLabels || "Beri nama halte"
                  : savedPlaces[0]?.name ?? "Simpan halte"}
              </span>
            </button>

            <button type="button" className="m3-bento__tile" onClick={() => openPane("card")}>
              <M3Shape
                shape="softburst"
                size={40}
                className="bg-m3-tertiary-container text-m3-on-tertiary-container"
              >
                <CreditCard aria-hidden className="size-5" />
              </M3Shape>
              <span className="m3-bento__label">Kartu</span>
              <span className="m3-bento__value tabular-nums">
                {card.balanceIdr === null ? "Belum dicatat" : formatRupiah(card.balanceIdr)}
              </span>
              <span className="m3-bento__hint">
                {card.balanceIdr === null ? "Catat saldo manual" : "Catatan pribadi"}
              </span>
            </button>

            <button type="button" className="m3-bento__tile" onClick={onOpenFollowedLines}>
              <M3Shape
                shape="cookie12"
                size={40}
                className="bg-m3-primary-container text-m3-on-primary-container"
              >
                <TrainFront aria-hidden className="size-5" />
              </M3Shape>
              <span className="m3-bento__label">Jalur diikuti</span>
              <span className="m3-bento__value tabular-nums">
                {followedLines.length === 0 ? "Belum ada" : `${followedLines.length} jalur`}
              </span>
              <span className="m3-bento__hint truncate">
                {followedLines.length === 0 ? "Ikuti dari Jalur" : codesOf(followedLines)}
              </span>
            </button>
          </section>

          <M3ExpressiveList ariaLabel="Pintasan Saya" surface="low">
            <M3ExpressiveListItem
              leading={<Settings aria-hidden />}
              leadingShape="cookie9"
              title="Pengaturan"
              subtitle="Rute, agent, tampilan, dan akun"
              trailing={<ChevronRight aria-hidden className="size-5" />}
              onClick={() => openPane("settings")}
            />
            <M3ExpressiveListItem
              leading={<Sparkles aria-hidden />}
              leadingShape="sunny"
              leadingTone="tertiary"
              title="Akun & sinkronisasi"
              subtitle={
                user ? user.email : "Masuk untuk membawa data ke perangkat lain"
              }
              trailing={<ChevronRight aria-hidden className="size-5" />}
              onClick={() => {
                if (user) {
                  setSettingsAccount(true);
                  setRefreshToken((token) => token + 1);
                  setPane("settings");
                  return;
                }
                openPane("auth");
              }}
            />
            <M3ExpressiveListItem
              leading={<RefreshCw aria-hidden />}
              leadingShape="circle"
              title="Ulangi tur pengenalan"
              subtitle="Tujuh moda, agent pemantau, dan rute cadangan"
              trailing={<ChevronRight aria-hidden className="size-5" />}
              onClick={onOpenOnboarding}
            />
            {!pwa.isInstalled ? (
              <M3ExpressiveListItem
                leading={<Download aria-hidden />}
                leadingShape="cookie9"
                title="Pasang aplikasi Daily"
                subtitle="Buka lebih cepat, tetap terbaca saat sinyal lemah"
                trailing={<Download aria-hidden className="size-5" />}
                onClick={() => {
                  if (!pwa.canPromptInstall) {
                    pwa.openInstallSheet();
                    return;
                  }
                  void pwa.promptInstall().then((outcome) => {
                    if (outcome === "unavailable") pwa.openInstallSheet();
                  });
                }}
              />
            ) : null}
            <M3ExpressiveListItem
              leading={<BellRing aria-hidden />}
              leadingShape="clover4"
              title="Kabar yang sudah diikuti"
              subtitle={`${followedLines.length} jalur, ${routines.length} rutinitas`}
              trailing={<ChevronRight aria-hidden className="size-5" />}
              onClick={onOpenFollowedLines}
            />
          </M3ExpressiveList>

          <p className="m3-bs px-1 text-m3-on-surface-variant">
            Rekap dibaca dari perjalanan yang kamu selesaikan di perangkat ini. Tidak ada
            hitungan dari server.
          </p>
        </div>
      </div>
    </div>
  );
}
