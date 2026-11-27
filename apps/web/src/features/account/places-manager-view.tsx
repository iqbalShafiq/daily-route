import {
  AlertCircle,
  ArrowLeft,
  LocateFixed,
  LogIn,
  MapPin,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  M3Button,
  M3Card,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Shape,
} from "../../components/m3e/index.js";
import { Input } from "../../components/ui/input.js";
import { ApiError, type AccountUser, type NamedPlace } from "../../lib/api.js";
import { displayNameOf, type ChosenPlace } from "../route-planner/place-memory.js";
import { PlaceInput, type MemorySuggestion } from "../route-planner/place-input.js";
import type { LocateResult } from "../route-planner/use-current-place.js";

export type PlacesManagerViewProps = {
  user: AccountUser | null;
  /** The names the rider stored with the account. */
  places: readonly NamedPlace[];
  /** The stops this browser saved while signed out. */
  savedPlaces: readonly ChosenPlace[];
  memoryError: string | null;
  memoryLoadFailed: boolean;
  onSavePlace: (label: string, place: NamedPlace["place"]) => Promise<void>;
  onRemovePlace: (label: string) => Promise<void>;
  onUseCurrentLocation: () => Promise<LocateResult>;
  onToggleSaved: (place: ChosenPlace) => void;
  onOpenAuth: () => void;
  onRetryMemory: () => void;
  onBack: () => void;
};

const PLACE_LIMIT = 16;

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

/**
 * Tempat dan moda favorit.
 *
 * A signed-in rider names places and the account keeps them. Without an
 * account the browser keeps the stops the rider starred in the search, and
 * the sheet says so rather than pretending the two lists are the same.
 */
export function PlacesManagerView({
  user,
  places,
  savedPlaces,
  memoryError,
  memoryLoadFailed,
  onSavePlace,
  onRemovePlace,
  onUseCurrentLocation,
  onToggleSaved,
  onOpenAuth,
  onRetryMemory,
  onBack,
}: PlacesManagerViewProps) {
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<ChosenPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  const memory = useMemo<MemorySuggestion[]>(
    () =>
      places.map((entry) => ({
        id: `${entry.label}:${entry.place.id}`,
        name: entry.label,
        detail: entry.place.address ?? entry.place.name,
        place: {
          kind: entry.place.kind,
          id: entry.place.id,
          name: entry.place.name,
          address: entry.place.address,
          latitude: entry.place.latitude,
          longitude: entry.place.longitude,
          systemId: entry.place.systemId,
          systemName: entry.place.systemName,
        },
      })),
    [places],
  );

  const atLimit = user !== null && places.length >= PLACE_LIMIT;
  const ready = chosen !== null && label.trim().length > 0;

  const startAdding = (): void => {
    setError(null);
    setAdding(true);
  };

  const cancelAdding = (): void => {
    setError(null);
    setAdding(false);
    setLabel("");
    setQuery("");
    setChosen(null);
    setFilter("");
  };

  const markCurrentLocation = async (): Promise<void> => {
    if (atLimit) return;
    setError(null);
    setLocating(true);
    try {
      const result = await onUseCurrentLocation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const place = result.place;
      setChosen(place);
      setQuery(place.address ?? place.name);
      setFilter(place.address ?? place.name);
      setLabel("Lokasi saat ini");
      setAdding(true);
      requestAnimationFrame(() => labelRef.current?.focus());
    } finally {
      setLocating(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!chosen || label.trim().length === 0 || atLimit) return;
    setBusy(true);
    setError(null);
    try {
      await onSavePlace(label.trim(), {
        kind: chosen.kind,
        id: chosen.id,
        name: chosen.name,
        address: chosen.address ?? null,
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        systemId: chosen.systemId ?? null,
        systemName: chosen.systemName ?? null,
      });
      cancelAdding();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string): Promise<void> => {
    setRemoving(name);
    setError(null);
    try {
      await onRemovePlace(name);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setRemoving(null);
    }
  };

  const needle = adding ? "" : filter.trim().toLowerCase();
  const visible = needle
    ? places.filter((entry) =>
        `${entry.label} ${entry.place.name}`.toLowerCase().includes(needle),
      )
    : places;

  return (
    <div className="m3-saya-view">
      <header className="m3-saya-view__head">
        <M3IconButton label="Kembali ke Saya" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="m3-tl m3-em text-m3-on-surface">Tempat</h1>
          <p className="m3-bs mt-1 text-m3-on-surface-variant">
            {user
              ? `${places.length} dari ${PLACE_LIMIT} tempat bernama`
              : "Tersimpan di perangkat ini"}
          </p>
        </div>
        {adding || atLimit || user === null ? null : (
          <M3Button
            variant="tonal"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={startAdding}
          >
            Tambah
          </M3Button>
        )}
      </header>

      <div className="m3-saya-view__scroll">
        <div className="grid gap-4 px-4 pb-6">
          {memoryError ? (
            <p role="alert" className="m3-bs text-m3-error">
              {memoryError}
            </p>
          ) : null}
          {memoryLoadFailed ? (
            <M3Card variant="error-container" radius="lg" className="grid gap-2 p-4">
              <p className="m3-tm flex items-center gap-2">
                <AlertCircle aria-hidden className="size-5" />
                Tempat akun tidak bisa dibaca
              </p>
              <M3Button variant="outlined" onClick={onRetryMemory}>
                Coba lagi
              </M3Button>
            </M3Card>
          ) : null}
          {error && !adding ? (
            <p role="alert" className="m3-bs text-m3-error">
              {error}
            </p>
          ) : null}

          {user !== null && adding ? (
            <form onSubmit={submit} className="grid gap-4">
              <M3Card variant="filled" radius="xl" className="grid gap-3 p-4">
                <M3Shape
                  shape="cookie9"
                  size={48}
                  className="bg-m3-primary-container text-m3-on-primary-container"
                >
                  <MapPin aria-hidden className="size-5" />
                </M3Shape>
                <p className="m3-tm text-m3-on-surface">Beri nama tempat ini</p>
                <PlaceInput
                  label="Tempat"
                  value={query}
                  placeholder="Cari halte, jalan, atau tempat"
                  memory={memory}
                  floating
                  onValueChange={(next) => {
                    setQuery(next);
                    setChosen(null);
                  }}
                  onSelectPlace={(place) => {
                    setChosen(place);
                    setQuery(place.address ?? place.name);
                  }}
                />
                {chosen ? (
                  <p className="m3-bs flex items-center gap-2 text-m3-on-surface-variant">
                    <span
                      aria-hidden
                      className="size-2 rounded-full border-2 border-m3-primary bg-m3-surface"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {chosen.address ?? chosen.name}
                    </span>
                  </p>
                ) : null}
                <Input
                  ref={labelRef}
                  label="Nama"
                  placeholder="Rumah, Kantor, atau nama lain"
                  autoComplete="off"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
                {error ? (
                  <p role="alert" className="m3-bs text-m3-error">
                    {error}
                  </p>
                ) : null}
                <M3Button type="submit" size="m" fullWidth disabled={busy || !ready}>
                  {busy ? "Menyimpan" : "Simpan tempat"}
                </M3Button>
                <M3Button variant="text" fullWidth onClick={cancelAdding} disabled={busy}>
                  Batal
                </M3Button>
              </M3Card>
            </form>
          ) : null}

          {user !== null && !adding ? (
            <div className="grid gap-2">
              <M3Button
                variant="tonal"
                icon={<LocateFixed aria-hidden className="size-4" />}
                fullWidth
                disabled={locating || atLimit}
                onClick={() => void markCurrentLocation()}
              >
                {locating ? "Membaca lokasi" : "Tandai lokasi sekarang"}
              </M3Button>
              <p className="m3-bs text-m3-on-surface-variant">
                Posisi dibaca sekali untuk mengisi alamat. Daily tidak menyimpannya di
                perangkat.
              </p>
              {atLimit ? (
                <p className="m3-bs text-m3-on-surface-variant">
                  Batas {PLACE_LIMIT} tempat bernama sudah tercapai. Hapus satu untuk
                  menambah yang lain.
                </p>
              ) : null}
            </div>
          ) : null}

          {user === null ? (
            <M3Card variant="secondary-container" radius="xl" className="grid gap-3 p-4">
              <p className="m3-tm">Sinkronkan tempat lintas perangkat</p>
              <p className="m3-bm">
                Kamu belum masuk. Tempat yang ditandai di perangkat ini tetap dipakai
                perencana rute. Masuk untuk menyimpannya ke akun.
              </p>
              <M3Button
                variant="filled"
                icon={<LogIn aria-hidden className="size-4" />}
                onClick={onOpenAuth}
              >
                Masuk
              </M3Button>
            </M3Card>
          ) : null}

          {user !== null && !adding ? (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="m3-ll text-m3-on-surface-variant">Tempat bernama</h2>
                {filter.trim().length > 0 ? (
                  <button
                    type="button"
                    className="m3-bs text-m3-primary"
                    onClick={() => setFilter("")}
                  >
                    Hapus saringan
                  </button>
                ) : null}
              </div>
              <PlaceInput
                label="Cari tempat bernama"
                value={filter}
                placeholder="Cari tempat yang sudah kamu simpan"
                memory={memory}
                onValueChange={setFilter}
                onSelectPlace={(place) => {
                  setChosen(place);
                  setQuery(displayNameOf(place));
                  setFilter(displayNameOf(place));
                  setError(null);
                  setAdding(true);
                  requestAnimationFrame(() => labelRef.current?.focus());
                }}
              />
              {places.length === 0 ? (
                <M3Card variant="filled" radius="lg" className="grid gap-2 p-4">
                  <p className="m3-tm">Belum ada tempat bernama</p>
                  <p className="m3-bm">
                    Simpan halte yang biasa kamu pakai dengan nama yang kamu kenali.
                  </p>
                </M3Card>
              ) : visible.length === 0 ? (
                <p className="m3-bs px-1 text-m3-on-surface-variant">
                  Tidak ada tempat yang cocok.
                </p>
              ) : (
                <M3ExpressiveList ariaLabel="Tempat bernama" surface="low">
                  {visible.map((entry) => (
                    <M3ExpressiveListItem
                      key={entry.label}
                      leading={<Star aria-hidden />}
                      leadingShape="cookie9"
                      leadingTone="tertiary"
                      title={entry.label}
                      subtitle={entry.place.address ?? entry.place.name}
                      trailing={
                        <M3IconButton
                          label={`Hapus ${entry.label}`}
                          size="s"
                          disabled={removing === entry.label}
                          onClick={() => void remove(entry.label)}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </M3IconButton>
                      }
                    />
                  ))}
                </M3ExpressiveList>
              )}
            </div>
          ) : null}

          {!adding && savedPlaces.length > 0 ? (
            <div className="grid gap-2">
              <h2 className="m3-ll text-m3-on-surface-variant">Halte dan tempat disimpan</h2>
              <M3ExpressiveList ariaLabel="Tempat disimpan di perangkat ini" surface="low">
                {savedPlaces.map((place) => (
                  <M3ExpressiveListItem
                    key={place.id}
                    leading={<Star aria-hidden />}
                    leadingShape="circle"
                    leadingTone="secondary"
                    title={place.name}
                    subtitle={place.address ?? (place.kind === "station" ? "Halte" : "Tempat")}
                    trailing={
                      <M3IconButton
                        label={`Hapus ${place.name} dari simpanan`}
                        size="s"
                        onClick={() => onToggleSaved(place)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </M3IconButton>
                    }
                  />
                ))}
              </M3ExpressiveList>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
