import {
  ArrowRight,
  BellRing,
  BusFront,
  CalendarClock,
  Check,
  ChevronLeft,
  Compass,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  ShieldCheck,
  TrainFront,
  TramFront,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  M3Button,
  M3Card,
  M3Chip,
  M3ConnectedButtonGroup,
  M3IconButton,
  M3LinearWavyProgress,
  M3LoadingIndicator,
  M3ModeBadge,
  M3Shape,
  M3Switch,
} from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
import { api, ApiError, type NamedPlace } from "../../lib/api.js";
import { useAccount } from "../account/use-account.js";
import { AuthSheet } from "../account/auth-sheet.js";
import {
  ALERT_SENSITIVITY_OPTIONS,
  PREFERRED_MODES,
  readRiderPreferences,
  saveRiderPreferences,
  type AlertSensitivity,
  type PreferredMode,
} from "../account/rider-preferences.js";
import { usePwa } from "../pwa/index.js";
import { displayNameOf, type ChosenPlace } from "../route-planner/place-memory.js";
import { PlaceInput } from "../route-planner/place-input.js";

/**
 * The onboarding.
 *
 * Seven screens: a splash, three pages about what Daily does, the real
 * sign-in, and two setup pages. It is a route of its own, never a redirect
 * from the map: a rider who only wants a journey never sees it. The last
 * step writes the preferences this browser keeps and returns to the map.
 *
 * The screen about the monitor shows an example. It is labelled as one and
 * does not present a made-up post as a notice the worker read.
 */

const INTRO_STEPS = 4;

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="m3-onboarding__dots" role="img" aria-label={`Langkah ${step + 1} dari ${INTRO_STEPS}`}>
      {Array.from({ length: INTRO_STEPS }, (_, index) => (
        <span
          key={index}
          className={cn("m3-onboarding__dot", index === step && "is-active")}
        />
      ))}
    </div>
  );
}

function ExamplePost() {
  return (
    <div
      className="m3-onboarding__post"
      role="group"
      aria-label="Contoh alur pantauan, bukan kiriman asli"
    >
      <div className="flex items-center gap-2">
        <M3Shape
          shape="circle"
          size={32}
          className="bg-m3-tertiary-container text-m3-on-tertiary-container"
        >
          <TrainFront aria-hidden className="size-4" />
        </M3Shape>
        <span className="min-w-0 flex-1">
          <span className="m3-ll block truncate">Operator KRL</span>
          <span className="m3-bs block text-m3-on-surface-variant">Contoh kiriman</span>
        </span>
        <span className="m3-bs tabular-nums text-m3-on-surface-variant">{"10:04"}</span>
      </div>
      <p className="m3-bm">
        Antrian di Stasiun Manggarai lebih panjang dari biasanya. Perjalanan ke arah
        Bogor berhenti sementara di Cikini.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="m3-chip is-selected" aria-hidden>
          Contoh alur pantauan
        </span>
        <span className="m3-bs text-m3-on-surface-variant">Bukan peringatan live</span>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const pwa = usePwa();
  const stored = useMemo(() => readRiderPreferences(), []);

  const [step, setStep] = useState<Step>(0);
  const [modes, setModes] = useState<PreferredMode[]>(stored.preferredModes);
  const [home, setHome] = useState<{ text: string; place: ChosenPlace | null }>({
    text: "",
    place: null,
  });
  const [office, setOffice] = useState<{ text: string; place: ChosenPlace | null }>({
    text: "",
    place: null,
  });
  const [shareLocation, setShareLocation] = useState(stored.shareLocation);
  const [notifications, setNotifications] = useState(stored.notifications);
  const [includeCitizenX, setIncludeCitizenX] = useState(stored.includeCitizenX);
  const [wakeBeforeAlight, setWakeBeforeAlight] = useState(stored.wakeBeforeAlight);
  const [sensitivity, setSensitivity] = useState<AlertSensitivity>(
    stored.alertSensitivity,
  );
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = (): void => {
    navigate({ to: "/" });
  };

  const skip = (): void => {
    finish();
  };

  const toggleMode = (mode: PreferredMode): void => {
    setModes((current) =>
      current.includes(mode)
        ? current.filter((item) => item !== mode)
        : PREFERRED_MODES.filter(
            (entry) => entry.id === mode || current.includes(entry.id),
          ).map((entry) => entry.id),
    );
  };

  const savePlaces = async (): Promise<void> => {
    if (!account.user) return;
    const writes: { label: string; place: ChosenPlace }[] = [];
    if (home.place) writes.push({ label: "Rumah", place: home.place });
    if (office.place) writes.push({ label: "Kantor", place: office.place });
    for (const write of writes) {
      const payload: NamedPlace["place"] = {
        kind: write.place.kind,
        id: write.place.id,
        name: write.place.name,
        address: write.place.address ?? null,
        latitude: write.place.latitude,
        longitude: write.place.longitude,
        systemId: write.place.systemId ?? null,
        systemName: write.place.systemName ?? null,
      };
      await api.saveNamedPlace(write.label, payload);
    }
  };

  const goSetupTwo = async (): Promise<void> => {
    saveRiderPreferences({ preferredModes: modes });
    setSaving(true);
    setNote(null);
    try {
      await savePlaces();
    } catch (error) {
      setNote(
        error instanceof ApiError
          ? error.message
          : "Tempat belum bisa disimpan ke akun. Kamu bisa menambahkannya nanti.",
      );
    } finally {
      setSaving(false);
      setStep(6);
    }
  };

  const askNotifications = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      setNotifications(false);
      setNote(null);
      return;
    }
    const result = await pwa.requestNotificationPermission();
    if (result === "granted") {
      setNotifications(true);
      setNote(null);
      return;
    }
    setNotifications(false);
    setNote(
      result === "needs-ios-install"
        ? "Pasang Daily ke layar utama dulu untuk memakai notifikasi di iOS."
        : result === "unsupported"
          ? "Browser ini belum mendukung notifikasi. Peta dan jadwal tetap berjalan."
          : "Izin notifikasi tidak diberikan. Kamu bisa mengaktifkannya di Pengaturan.",
    );
  };

  const askLocation = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      setShareLocation(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setShareLocation(false);
      setNote("Browser ini tidak membagikan posisi.");
      return;
    }
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setShareLocation(true);
          setNote(null);
          resolve();
        },
        () => {
          setShareLocation(false);
          setNote("Izin lokasi tidak diberikan. Rute tetap bisa dicari lewat nama tempat.");
          resolve();
        },
        { timeout: 10_000 },
      );
    });
  };

  const enterMap = (): void => {
    saveRiderPreferences({
      onboardingCompleted: true,
      preferredModes: modes,
      shareLocation,
      notifications,
      includeCitizenX,
      wakeBeforeAlight,
      alertSensitivity: sensitivity,
    });
    finish();
  };

  const header = (
    step: number,
  ): ReactNode => (
    <header className="m3-onboarding__head">
      <M3IconButton
        label={step === 0 ? "Lewati tur" : "Langkah sebelumnya"}
        onClick={() => {
          if (step === 0) skip();
          else setStep((step - 1) as Step);
        }}
      >
        {step === 0 ? <X aria-hidden /> : <ChevronLeft aria-hidden />}
      </M3IconButton>
      <span className="m3-lm min-w-0 flex-1 uppercase tracking-[0.08em] text-m3-primary">
        Daily Route
      </span>
      {step <= 3 ? (
        <M3Button variant="text" size="s" onClick={skip}>
          Lewati
        </M3Button>
      ) : (
        <span className="m3-bs text-m3-on-surface-variant">Setup</span>
      )}
    </header>
  );

  if (step === 0) {
    return (
      <main className="m3-onboarding m3-onboarding--splash">
        <div className="m3-onboarding__splash-shapes" aria-hidden>
          <M3Shape shape="cookie12" size={280} className="m3-onboarding__orbit m3-onboarding__orbit--a" />
          <M3Shape shape="sunny" size={150} className="m3-onboarding__orbit m3-onboarding__orbit--b" />
          <M3Shape shape="cookie4" size={72} className="m3-onboarding__orbit m3-onboarding__orbit--c" />
        </div>
        <div className="m3-onboarding__splash">
          <p className="m3-onboarding__wordmark">daily</p>
          <p className="m3-tl mt-2">
            Jalan tiap hari, tanpa drama.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <M3LoadingIndicator variant="contained" label="Menyiapkan peta" />
            <p className="m3-bs">Menyiapkan peta Jabodetabek</p>
          </div>
        </div>
        <div className="m3-onboarding__splash-foot">
          <M3Button
            size="m"
            fullWidth
            variant="inverse"
            trailingIcon={<ArrowRight aria-hidden />}
            onClick={() => setStep(1)}
          >
            Lanjut
          </M3Button>
          <M3Button
            variant="text"
            fullWidth
            className="text-m3-on-primary"
            onClick={skip}
          >
            Lewati
          </M3Button>
        </div>
      </main>
    );
  }

  if (step === 4) {
    return (
      <main className="m3-onboarding">
        <div className="m3-onboarding__frame">
          <AuthSheet
            user={account.user}
            onSignIn={account.signIn}
            onSignUp={account.signUp}
            onSignedIn={() => setStep(5)}
            onGuest={() => setStep(5)}
            onClose={() => setStep(3)}
            variant="onboarding"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="m3-onboarding">
      <div className="m3-onboarding__frame">
        {header(step)}

        {step <= 3 ? <ProgressDots step={step} /> : null}

        <div className="m3-onboarding__body">
          {step === 1 ? (
            <section className="m3-onboarding__page" aria-label="Semua moda">
              <M3Shape
                shape="cookie9"
                size={132}
                className="mx-auto bg-m3-primary-container text-m3-on-primary-container"
              >
                <Compass aria-hidden className="size-12" />
              </M3Shape>
              <h1 className="m3-hm m3-em mt-6">Tujuh moda. Satu peta.</h1>
              <p className="m3-bm mt-2 text-m3-on-surface-variant">
                KRL, MRT, LRT Jakarta, LRT Jabodebek, Transjakarta BRT, Non-BRT, dan
                Mikrotrans dibaca sebagai satu jaringan. Ganti kendaraan tanpa menebak
                halte.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {PREFERRED_MODES.map((mode) => (
                  <M3ModeBadge key={mode.id} mode={mode.id} size="md" />
                ))}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="m3-onboarding__page" aria-label="Agent pemantau">
              <M3Shape
                shape="softburst"
                size={112}
                className="mx-auto bg-m3-tertiary-container text-m3-on-tertiary-container"
              >
                <ShieldCheck aria-hidden className="size-10" />
              </M3Shape>
              <h1 className="m3-hm m3-em mt-6">Tahu duluan, bukan ketahuan.</h1>
              <p className="m3-bm mt-2 text-m3-on-surface-variant">
                Agent membaca pengumuman operator dan laporan warga, mencocokkannya dengan
                jalurmu, lalu menyiapkan jalan lain sebelum kamu sampai di halte.
              </p>
              <M3Card variant="tertiary-container" radius="2xl" className="mt-6 grid gap-3 p-4">
                <ExamplePost />
                <div className="m3-onboarding__alt">
                  <span className="flex items-center gap-2">
                    <RouteIcon aria-hidden className="size-5" />
                    <span className="m3-ll">Rute cadangan siap</span>
                  </span>
                  <span className="m3-bs">
                    Cikini ke Dukuh Atas lewat MRT, rute cadangan sudah dihitung.
                  </span>
                </div>
              </M3Card>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="m3-onboarding__page" aria-label="Rute cadangan">
              <M3Shape
                shape="softburst"
                size={96}
                className="mb-2 bg-m3-secondary-container text-m3-on-secondary-container"
              >
                <RouteIcon aria-hidden className="size-9" />
              </M3Shape>
              <h1 className="m3-hm m3-em">Hafal rutinitasmu, siap plan B.</h1>
              <p className="m3-bm mt-2 text-m3-on-surface-variant">
                Simpan perjalanan yang kamu ulang. Saat jalurnya tertutup, Daily menyiapkan
                alternatif dan mengingatkan sebelum kamu harus turun.
              </p>
              <M3Card variant="secondary-container" radius="2xl" className="mt-6 grid gap-3 p-5">
                <p className="m3-ll flex items-center gap-2">
                  <CalendarClock aria-hidden className="size-5" />
                  Rutinitas pagi
                </p>
                <p className="m3-bm">
                  Rumah ke Kantor, Senin sampai Jumat, tiba sebelum 07:50. Rute cadangan
                  dipilih saat koridor utamamu tertutup.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="m3-chip m3-chip--suggestion">
                    <Check aria-hidden className="size-4" />
                    Otomatis
                  </span>
                  <span className="m3-chip m3-chip--suggestion">
                    <BellRing aria-hidden className="size-4" />
                    Ingatkan
                  </span>
                </div>
              </M3Card>
            </section>
          ) : null}

          {step === 5 ? (
            <section aria-label="Setup tempat dan moda" className="grid gap-4">
              <div className="grid gap-2">
                <M3LinearWavyProgress value={0.5} label="Setup satu dari dua" />
                <p className="m3-bs tabular-nums text-m3-on-surface-variant">{"Setup 1 dari 2"}</p>
              </div>
              <h1 className="m3-hm m3-em">Ke mana kamu biasa pergi?</h1>
              <p className="m3-bm text-m3-on-surface-variant">
                Beri nama dua tempat yang paling sering kamu tuju. Kamu bisa mengubahnya
                kapan saja di Saya.
              </p>

              <div className="grid gap-3">
                <PlaceInput
                  label="Rumah"
                  value={home.text}
                  placeholder="Cari halte atau alamat rumah"
                  onValueChange={(value) =>
                    setHome((current) => ({
                      text: value,
                      place:
                        current.place && displayNameOf(current.place) === value
                          ? current.place
                          : null,
                    }))
                  }
                  onSelectPlace={(place) => setHome({ text: displayNameOf(place), place })}
                  icon={<MapPin aria-hidden className="size-4" />}
                />
                <PlaceInput
                  label="Kantor"
                  value={office.text}
                  placeholder="Cari halte atau alamat kantor"
                  onValueChange={(value) =>
                    setOffice((current) => ({
                      text: value,
                      place:
                        current.place && displayNameOf(current.place) === value
                          ? current.place
                          : null,
                    }))
                  }
                  onSelectPlace={(place) =>
                    setOffice({ text: displayNameOf(place), place })
                  }
                  icon={<MapPin aria-hidden className="size-4" />}
                />
              </div>

              <div className="grid gap-2">
                <p className="m3-ll text-m3-on-surface-variant">Moda yang kamu pilih</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Moda favorit">
                  {PREFERRED_MODES.map((mode) => {
                    const on = modes.includes(mode.id);
                    return (
                      <M3Chip
                        key={mode.id}
                        variant="filter"
                        selected={on}
                        icon={
                          mode.id === "krl" ? (
                            <TrainFront aria-hidden className="size-4" />
                          ) : mode.id === "mrt" ? (
                            <TrainFront aria-hidden className="size-4" />
                          ) : mode.id === "mikro" ? (
                            <BusFront aria-hidden className="size-4" />
                          ) : (
                            <TramFront aria-hidden className="size-4" />
                          )
                        }
                        onClick={() => toggleMode(mode.id)}
                      >
                        {mode.label}
                      </M3Chip>
                    );
                  })}
                </div>
                <p className="m3-bs text-m3-on-surface-variant">
                  Pilihan ini hanya mengurutkan saran. Semua moda tetap bisa dipakai.
                </p>
              </div>

              {note ? (
                <p role="alert" className="m3-bs text-m3-on-surface-variant">
                  {note}
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 6 ? (
            <section aria-label="Setup izin dan agent" className="grid gap-4">
              <div className="grid gap-2">
                <M3LinearWavyProgress value={1} label="Setup dua dari dua" />
                <p className="m3-bs tabular-nums text-m3-on-surface-variant">{"Setup 2 dari 2"}</p>
              </div>
              <h1 className="m3-hm m3-em">Biar agent bisa jagain kamu.</h1>
              <p className="m3-bm text-m3-on-surface-variant">
                Pilih apa yang boleh dibaca. Izin bisa dimatikan lagi kapan saja di
                Pengaturan.
              </p>

              <div className="grid gap-2">
                <div className="m3-onboarding__switch">
                  <span className="m3-onboarding__switch-icon">
                    <MapPin aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="m3-tm block">Lokasi</span>
                    <span className="m3-bs block text-m3-on-surface-variant">
                      Tandai tempat berdiri untuk mencari halte terdekat.
                    </span>
                  </span>
                  <M3Switch
                    aria-label="Lokasi"
                    checked={shareLocation}
                    onCheckedChange={(checked) => void askLocation(checked)}
                  />
                </div>
                <div className="m3-onboarding__switch">
                  <span className="m3-onboarding__switch-icon">
                    <BellRing aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="m3-tm block">Notifikasi</span>
                    <span className="m3-bs block text-m3-on-surface-variant">
                      Kabar gangguan dan pengingat turun di perangkat ini.
                    </span>
                  </span>
                  <M3Switch
                    aria-label="Notifikasi"
                    checked={notifications}
                    onCheckedChange={(checked) => void askNotifications(checked)}
                  />
                </div>
                <div className="m3-onboarding__switch">
                  <span className="m3-onboarding__switch-icon">
                    <MessageSquare aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="m3-tm block">Pantau kabar dari X</span>
                    <span className="m3-bs block text-m3-on-surface-variant">
                      Baca laporan warga dan akun operator, lalu sebutkan sumbernya.
                    </span>
                  </span>
                  <M3Switch
                    aria-label="Pantau kabar dari X"
                    checked={includeCitizenX}
                    onCheckedChange={setIncludeCitizenX}
                  />
                </div>
                <div className="m3-onboarding__switch">
                  <span className="m3-onboarding__switch-icon">
                    <TriangleAlert aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="m3-tm block">Bangunkan sebelum turun</span>
                    <span className="m3-bs block text-m3-on-surface-variant">
                      Satu halte sebelum tujuan, ponsel berbunyi.
                    </span>
                  </span>
                  <M3Switch
                    aria-label="Bangunkan sebelum turun"
                    checked={wakeBeforeAlight}
                    onCheckedChange={setWakeBeforeAlight}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <p className="m3-tm">Seberapa cerewet agent-nya?</p>
                <M3ConnectedButtonGroup
                  ariaLabel="Seberapa cerewet agent-nya"
                  size="s"
                  value={sensitivity}
                  onChange={(value) => {
                    if (value === "important" || value === "balanced" || value === "all") {
                      setSensitivity(value);
                    }
                  }}
                  options={ALERT_SENSITIVITY_OPTIONS.map((option) => ({ ...option }))}
                />
              </div>

              {note ? (
                <p role="alert" className="m3-bs text-m3-on-surface-variant">
                  {note}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="m3-onboarding__foot">
          {step === 3 ? (
            <M3Button
              size="m"
              fullWidth
              trailingIcon={<ArrowRight aria-hidden />}
              onClick={() => setStep(4)}
            >
              Mulai
            </M3Button>
          ) : step === 5 ? (
            <M3Button
              size="m"
              fullWidth
              disabled={saving}
              trailingIcon={<ArrowRight aria-hidden />}
              onClick={() => void goSetupTwo()}
            >
              {saving ? "Menyimpan" : "Lanjut"}
            </M3Button>
          ) : step === 6 ? (
            <M3Button
              size="m"
              fullWidth
              icon={<UserRound aria-hidden />}
              onClick={enterMap}
            >
              Masuk ke peta
            </M3Button>
          ) : (
            <M3Button
              size="m"
              fullWidth
              trailingIcon={<ArrowRight aria-hidden />}
              onClick={() => setStep((step + 1) as Step)}
            >
              Lanjut
            </M3Button>
          )}
          {step === 6 ? (
            <M3Button variant="text" fullWidth onClick={skip}>
              Nanti saja
            </M3Button>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
