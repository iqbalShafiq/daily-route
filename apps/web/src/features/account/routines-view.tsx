import {
  ArrowLeft,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  M3Button,
  M3Card,
  M3ConnectedButtonGroup,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Shape,
  M3Switch,
} from "../../components/m3e/index.js";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.js";
import { Input } from "../../components/ui/input.js";
import { cn } from "../../lib/cn.js";
import { displayNameOf, type ChosenPlace } from "../route-planner/place-memory.js";
import { PlaceInput, type MemorySuggestion } from "../route-planner/place-input.js";
import {
  DEFAULT_ROUTINE_DAYS,
  ROUTINE_DAY_LABELS,
  deleteRoutine,
  readRoutines,
  routineDaysOf,
  saveRoutine,
  updateRoutine,
  type RoutineDay,
  type RoutineRecord,
  type RoutineReminder,
} from "../route-planner/live-trip.js";

export type RoutinesViewProps = {
  memory: readonly MemorySuggestion[];
  onPlan: (routine: RoutineRecord) => void;
  onBack: () => void;
};

type Draft = {
  id: string | null;
  label: string;
  originName: string;
  origin: ChosenPlace | null;
  destinationName: string;
  destination: ChosenPlace | null;
  arriveBy: string;
  days: RoutineDay[];
  remindMinutes: RoutineReminder;
  autoReroute: boolean;
};

const REMINDER_OPTIONS = [
  { value: "5", label: "5 mnt" },
  { value: "10", label: "10 mnt" },
  { value: "15", label: "15 mnt" },
] as const;

function draftOf(routine: RoutineRecord | null): Draft {
  if (!routine) {
    return {
      id: null,
      label: "",
      originName: "",
      origin: null,
      destinationName: "",
      destination: null,
      arriveBy: "",
      days: [...DEFAULT_ROUTINE_DAYS],
      remindMinutes: 10,
      autoReroute: true,
    };
  }
  return {
    id: routine.id,
    label: routine.label ?? "",
    originName: routine.originName,
    origin: routine.origin,
    destinationName: routine.destinationName,
    destination: routine.destination,
    arriveBy: routine.arriveBy ?? routine.departureTime ?? "",
    days: routineDaysOf(routine),
    remindMinutes: routine.remindMinutes ?? 10,
    autoReroute: routine.autoReroute ?? true,
  };
}

/** The days a routine runs, as the same pills the editor offers. */
function DayPills({ days }: { days: readonly RoutineDay[] }) {
  return (
    <span className="flex flex-wrap gap-1" aria-label="Hari aktif">
      {([1, 2, 3, 4, 5, 6, 0] as RoutineDay[]).map((day) => (
        <span
          key={day}
          className={cn("m3-day-pill is-static", days.includes(day) && "is-on")}
          aria-label={ROUTINE_DAY_LABELS[day]}
        >
          {ROUTINE_DAY_LABELS[day][0]}
        </span>
      ))}
    </span>
  );
}

/**
 * Atur rutinitas.
 *
 * A routine is a pair of places and a clock, stored in this browser. The
 * list is the same record Kotak masuk reads; "Pakai rute" hands it to the
 * planner, and nothing here claims to watch the network on its own.
 */
export function RoutinesView({ memory, onPlan, onBack }: RoutinesViewProps) {
  const [routines, setRoutines] = useState<RoutineRecord[]>(() => readRoutines());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RoutineRecord | null>(null);

  const openNew = (): void => {
    setError(null);
    setDraft(draftOf(null));
  };

  const openEdit = (routine: RoutineRecord): void => {
    setError(null);
    setDraft(draftOf(routine));
  };

  const remove = (routine: RoutineRecord): void => {
    setRoutines(deleteRoutine(routine.id));
    setRemoving(null);
  };

  const toggleDay = (day: RoutineDay): void => {
    setDraft((current) => {
      if (!current) return current;
      const days = current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day].sort((left, right) => left - right);
      return { ...current, days };
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!draft) return;
    const originName = draft.originName.trim();
    const destinationName = draft.destinationName.trim();
    if (originName.length === 0 || destinationName.length === 0) {
      setError("Isi tempat asal dan tujuan dulu.");
      return;
    }
    if (draft.days.length === 0) {
      setError("Pilih setidaknya satu hari.");
      return;
    }
    const patch = {
      originName,
      destinationName,
      origin: draft.origin,
      destination: draft.destination,
      label: draft.label.trim().length > 0 ? draft.label.trim() : null,
      arriveBy: draft.arriveBy.length > 0 ? draft.arriveBy : null,
      days: draft.days,
      remindMinutes: draft.remindMinutes,
      autoReroute: draft.autoReroute,
    };
    if (draft.id) {
      setRoutines(updateRoutine(draft.id, patch));
    } else {
      setRoutines(
        saveRoutine({
          ...patch,
          departureTime: null,
        }),
      );
    }
    setDraft(null);
    setError(null);
  };

  return (
    <div className="m3-saya-view">
      <header className="m3-saya-view__head">
        <M3IconButton
          label={draft ? "Batal dari formulir rutinitas" : "Kembali ke Saya"}
          onClick={draft ? () => setDraft(null) : onBack}
        >
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="m3-tl m3-em text-m3-on-surface">
            {draft ? (draft.id ? "Ubah rutinitas" : "Rutinitas baru") : "Rutinitas"}
          </h1>
          <p className="m3-bs mt-1 text-m3-on-surface-variant">
            {draft
              ? "Simpan di perangkat ini"
              : `${routines.length} rutinitas tersimpan di perangkat ini`}
          </p>
        </div>
        {draft ? null : (
          <M3Button variant="tonal" icon={<Plus aria-hidden className="size-4" />} onClick={openNew}>
            Tambah
          </M3Button>
        )}
      </header>

      <div className="m3-saya-view__scroll">
        {draft ? (
          <form onSubmit={submit} className="grid gap-4 px-4 pb-6">
            <div className="grid gap-2">
              <p className="m3-ll text-m3-on-surface-variant">Rute</p>
              <PlaceInput
                label="Dari"
                value={draft.originName}
                placeholder="Cari halte atau tempat asal"
                memory={[...memory]}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          originName: value,
                          origin:
                            current.origin && displayNameOf(current.origin) === value
                              ? current.origin
                              : null,
                        }
                      : current,
                  )
                }
                onSelectPlace={(place) =>
                  setDraft((current) =>
                    current
                      ? { ...current, origin: place, originName: displayNameOf(place) }
                      : current,
                  )
                }
              />
              <PlaceInput
                label="Ke"
                value={draft.destinationName}
                placeholder="Cari halte atau tempat tujuan"
                memory={[...memory]}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          destinationName: value,
                          destination:
                            current.destination &&
                            displayNameOf(current.destination) === value
                              ? current.destination
                              : null,
                        }
                      : current,
                  )
                }
                onSelectPlace={(place) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          destination: place,
                          destinationName: displayNameOf(place),
                        }
                      : current,
                  )
                }
              />
            </div>

            <Input
              label="Tiba sebelum"
              type="time"
              placeholder="07:50"
              value={draft.arriveBy}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, arriveBy: event.target.value } : current,
                )
              }
            />

            <div className="grid gap-2">
              <p className="m3-ll text-m3-on-surface-variant">Hari aktif</p>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Hari aktif">
                {([1, 2, 3, 4, 5, 6, 0] as RoutineDay[]).map((day) => {
                  const on = draft.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={ROUTINE_DAY_LABELS[day]}
                      className={cn("m3-day-pill", on && "is-on")}
                      onClick={() => toggleDay(day)}
                    >
                      {ROUTINE_DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <p className="m3-ll text-m3-on-surface-variant">Ingatkan sebelum berangkat</p>
              <M3ConnectedButtonGroup
                ariaLabel="Ingatkan sebelum berangkat"
                size="s"
                value={String(draft.remindMinutes)}
                onChange={(value) => {
                  const minutes = Number(value);
                  if (minutes !== 5 && minutes !== 10 && minutes !== 15) return;
                  setDraft((current) =>
                    current ? { ...current, remindMinutes: minutes } : current,
                  );
                }}
                options={REMINDER_OPTIONS.map((option) => ({ ...option }))}
              />
            </div>

            <div className="flex items-center gap-3 rounded-[14px] bg-m3-surface-container-low px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="m3-tm text-m3-on-surface">Ganti rute otomatis</p>
                <p className="m3-bs text-m3-on-surface-variant">
                  Agent menyiapkan jalan lain saat rute ini tertutup.
                </p>
              </div>
              <M3Switch
                aria-label="Ganti rute otomatis"
                checked={draft.autoReroute}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current ? { ...current, autoReroute: checked } : current,
                  )
                }
              />
            </div>

            <Input
              label="Nama rutinitas"
              placeholder="Rutinitas pagi"
              value={draft.label}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, label: event.target.value } : current,
                )
              }
            />

            {error ? (
              <p role="alert" className="m3-bs text-m3-error">
                {error}
              </p>
            ) : null}

            <M3Button type="submit" size="m" fullWidth icon={<RouteIcon aria-hidden />}>
              Simpan
            </M3Button>
          </form>
        ) : routines.length === 0 ? (
          <div className="px-4 pb-6">
            <M3Card variant="secondary-container" radius="xl" className="grid gap-3 p-5">
              <M3Shape
                shape="softburst"
                size={56}
                className="bg-m3-secondary-container text-m3-on-secondary-container"
              >
                <Clock3 aria-hidden className="size-6" />
              </M3Shape>
              <p className="m3-tm">Belum ada rutinitas</p>
              <p className="m3-bm">
                Simpan perjalanan yang kamu ulang setiap pagi. Rutinitas muncul di Kotak masuk
                sebagai pengingat, bukan sebagai jadwal keberangkatan.
              </p>
              <M3Button
                variant="filled"
                icon={<Plus aria-hidden className="size-4" />}
                onClick={openNew}
              >
                Buat rutinitas
              </M3Button>
            </M3Card>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <M3ExpressiveList ariaLabel="Rutinitas tersimpan" surface="low">
              {routines.map((routine) => {
                const days = routineDaysOf(routine);
                const clock = routine.arriveBy ?? routine.departureTime;
                const title =
                  routine.label ??
                  `${routine.originName} ke ${routine.destinationName}`;
                return (
                  <M3ExpressiveListItem
                    key={routine.id}
                    leading={<Clock3 aria-hidden />}
                    leadingShape="cookie9"
                    leadingTone="primary"
                    title={title}
                    subtitle={
                      <span className="grid gap-1">
                        <span className="truncate">
                          {routine.originName} ke {routine.destinationName}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <DayPills days={days} />
                          <span className="m3-bs tabular-nums">
                            {clock
                              ? `${routine.arriveBy ? "Tiba" : "Berangkat"} ${clock}`
                              : "Tanpa jam"}
                          </span>
                        </span>
                      </span>
                    }
                    trailing={
                      <span className="flex items-center gap-1">
                        <M3Button
                          variant="tonal"
                          size="xs"
                          onClick={() => onPlan(routine)}
                        >
                          Pakai rute
                        </M3Button>
                        <M3IconButton
                          label={`Ubah rutinitas ${title}`}
                          size="s"
                          onClick={() => openEdit(routine)}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </M3IconButton>
                        <M3IconButton
                          label={`Hapus rutinitas ${title}`}
                          size="s"
                          onClick={() => setRemoving(routine)}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </M3IconButton>
                      </span>
                    }
                  />
                );
              })}
            </M3ExpressiveList>

            <p className="m3-bs mt-3 flex items-start gap-2 px-1 text-m3-on-surface-variant">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              Rutinitas tinggal di browser ini. Masuk ke akun untuk membawanya ke perangkat
              lain.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Hapus rutinitas"
        description={
          removing
            ? `${removing.originName} ke ${removing.destinationName} akan dihapus dari perangkat ini.`
            : ""
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        tone="danger"
        onConfirm={() => {
          if (removing) remove(removing);
        }}
      />
    </div>
  );
}
