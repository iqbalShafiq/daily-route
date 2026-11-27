import { useState } from "react";
import { Check, Repeat2 } from "lucide-react";

import {
  M3Button,
  M3Card,
  M3ConnectedButtonGroup,
  M3Shape,
  M3Snackbar,
} from "../../components/m3e/index.js";
import type { Itinerary } from "../../lib/api.js";
import { formatDistance, formatRupiah } from "../../lib/format.js";

import {
  recordCompletedTrip,
  saveRoutine,
  type CrowdRating,
} from "./live-trip.js";
import type { ChosenPlace } from "./place-memory.js";

const CONFETTI: readonly {
  shape: "cookie4" | "cookie6" | "gem" | "sunny" | "diamond" | "clover4";
  left: string;
  top: string;
  size: number;
  delay: string;
  tone: string;
}[] = [
  { shape: "cookie4", left: "8%", top: "12%", size: 22, delay: "0ms", tone: "bg-m3-primary" },
  { shape: "gem", left: "78%", top: "8%", size: 18, delay: "80ms", tone: "bg-m3-tertiary" },
  { shape: "sunny", left: "86%", top: "44%", size: 26, delay: "140ms", tone: "bg-m3-secondary" },
  { shape: "diamond", left: "12%", top: "52%", size: 16, delay: "190ms", tone: "bg-m3-tertiary" },
  { shape: "clover4", left: "68%", top: "62%", size: 20, delay: "240ms", tone: "bg-m3-primary" },
  { shape: "cookie6", left: "26%", top: "78%", size: 18, delay: "300ms", tone: "bg-m3-secondary" },
];

function fareOf(route: Itinerary): number | null {
  return route.fare.available ? route.fare.totalIdr : null;
}

/**
 * Sampai tujuan.
 *
 * The journey ends with the numbers that were actually spent, not a new
 * estimate. The two local records are written here: a finished trip for
 * the monthly recap, and a routine when the rider asks for one.
 */
export function ArrivedView({
  originName,
  destinationName,
  origin,
  destination,
  route,
  elapsedMinutes,
  departureTime,
  onDone,
}: {
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
  route: Itinerary;
  elapsedMinutes: number;
  departureTime: string | null;
  onDone: () => void;
}) {
  const [crowd, setCrowd] = useState<CrowdRating | null>(null);
  const [routineSaved, setRoutineSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const planned = route.durationMinutes;
  const difference = planned - elapsedMinutes;
  const subtitle =
    Math.abs(difference) < 1
      ? "Sesuai perkiraan waktu perjalanan."
      : difference > 0
        ? `${difference} menit lebih cepat dari perkiraan.`
        : `${Math.abs(difference)} menit lebih lama dari perkiraan.`;
  const fare = fareOf(route);

  const makeRoutine = (): void => {
    saveRoutine({
      originName,
      destinationName,
      origin,
      destination,
      departureTime,
    });
    setRoutineSaved(true);
    setMessage("Rutinitas disimpan. Kamu bisa mengaturnya di Saya.");
  };

  const finish = (): void => {
    recordCompletedTrip({
      originName,
      destinationName,
      durationMinutes: elapsedMinutes,
      fareIdr: fare,
      walkKm: route.walkingKm,
      crowdRating: crowd,
      completedAt: new Date().toISOString(),
    });
    onDone();
  };

  return (
    <section
      aria-label="Sampai tujuan"
      className="fixed inset-0 z-50 overflow-y-auto bg-m3-surface text-m3-on-surface lg:inset-y-0 m3-stage-panel lg:right-auto lg:w-[420px] lg:border-r lg:border-m3-outline-variant"
    >
      <div className="relative grid justify-items-center gap-3 overflow-hidden px-5 pb-6 pt-[calc(env(safe-area-inset-top)+40px)] text-center">
        {CONFETTI.map((piece) => (
          <span
            key={`${piece.shape}-${piece.left}`}
            aria-hidden
            className="m3-confetti m3-bob absolute"
            style={{ left: piece.left, top: piece.top, animationDelay: piece.delay }}
          >
            <M3Shape
              shape={piece.shape}
              size={piece.size}
              className={`${piece.tone} m3-pop`}
            />
          </span>
        ))}

        <div className="relative grid size-32 place-items-center">
          <M3Shape
            shape="sunny"
            size={128}
            className="absolute bg-m3-primary-container text-m3-on-primary-container m3-breathe"
          />
          <M3Shape
            shape="cookie12"
            size={96}
            className="absolute bg-m3-primary text-m3-on-primary"
          />
          <span className="relative grid size-16 place-items-center rounded-full bg-m3-surface">
            <Check aria-hidden className="size-8 text-m3-primary" />
          </span>
        </div>

        <div className="grid gap-2">
          <h1 className="m3-hm m3-em">Sampai di {destinationName}</h1>
          <p className="m3-bm text-m3-on-surface-variant">{subtitle}</p>
        </div>
      </div>

      <div className="grid gap-4 px-4 pb-[calc(40px+env(safe-area-inset-bottom))]">
        <div className="m3-stat-row">
          <div className="m3-stat">
            <p className="m3-bs text-m3-on-surface-variant">Waktu tempuh</p>
            <p className="m3-hs m3-em m3-num tabular-nums">{elapsedMinutes}</p>
            <p className="m3-bs text-m3-on-surface-variant">mnt</p>
          </div>
          <div className="m3-stat">
            <p className="m3-bs text-m3-on-surface-variant">Tarif</p>
            <p className="m3-tm m3-em m3-num tabular-nums">
              {fare === null ? "Belum ada" : formatRupiah(fare)}
            </p>
            <p className="m3-bs text-m3-on-surface-variant">terbayar</p>
          </div>
          <div className="m3-stat">
            <p className="m3-bs text-m3-on-surface-variant">Jalan kaki</p>
            <p className="m3-tm m3-em m3-num tabular-nums">
              {formatDistance(route.walkingKm)}
            </p>
            <p className="m3-bs text-m3-on-surface-variant">total</p>
          </div>
        </div>

        <M3Card variant="filled" radius="xl" className="grid gap-3">
          <div className="grid gap-1">
            <p className="m3-tm">Bagaimana kepadatan tadi?</p>
            <p className="m3-bs text-m3-on-surface-variant">
              Jawabanmu membantu memperkirakan kepadatan untuk komuter lain.
            </p>
          </div>
          <M3ConnectedButtonGroup
            size="xs"
            ariaLabel="Kepadatan perjalanan"
            value={crowd ?? ""}
            onChange={(value) => {
              if (value === "lega" || value === "lumayan" || value === "desak-desakan") {
                setCrowd(value);
              }
            }}
            options={[
              { value: "lega", label: "Lega" },
              { value: "lumayan", label: "Lumayan" },
              { value: "desak-desakan", label: "Desak-desakan" },
            ]}
          />
        </M3Card>

        <div className="grid gap-2">
          <M3Button
            variant="tonal"
            size="m"
            fullWidth
            icon={<Repeat2 aria-hidden />}
            onClick={makeRoutine}
            disabled={routineSaved}
          >
            {routineSaved ? "Rutinitas tersimpan" : "Jadikan rutinitas"}
          </M3Button>
          <M3Button
            variant="filled"
            size="m"
            fullWidth
            icon={<Check aria-hidden />}
            onClick={finish}
          >
            Selesai
          </M3Button>
        </div>

        <p className="m3-bs text-center text-m3-on-surface-variant">
          Perjalanan disimpan di perangkat ini. Tidak ada akun yang diperlukan.
        </p>
      </div>

      <M3Snackbar open={message !== null} message={message ?? ""} onDismiss={() => setMessage(null)} />
    </section>
  );
}

export type ArrivedRouteSummary = {
  originName: string;
  destinationName: string;
  elapsedMinutes: number;
};
