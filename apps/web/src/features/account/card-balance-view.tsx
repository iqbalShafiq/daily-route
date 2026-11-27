import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Nfc,
  RotateCcw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  M3Button,
  M3Card,
  M3Chip,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Switch,
} from "../../components/m3e/index.js";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.js";
import { Input } from "../../components/ui/input.js";
import { formatDateTime, formatRupiah } from "../../lib/format.js";
import {
  LOW_BALANCE_DEFAULT_IDR,
  readTransitCard,
  recordManualBalance,
  recordNfcTap,
  resetTransitCard,
  saveTransitCard,
  simulateCardTap,
  type TransitCardState,
} from "./rider-preferences.js";

/* -------------------------------------------------------------------------
 * Web NFC
 *
 * The DOM library does not ship the NDEF reader. The shape below is the
 * part of the specification this screen uses: a constructor and `scan`.
 * A browser without it reports `null`, and the screen keeps the manual
 * ledger instead of pretending the phone can read a card.
 * ---------------------------------------------------------------------- */

type NdefReadingEvent = { serialNumber?: string };
type NdefReaderLike = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
};
type NdefReaderConstructor = new () => NdefReaderLike;

function nfcSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "NDEFReader" in window;
}

function nfcReader(): NdefReaderLike | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { NDEFReader?: NdefReaderConstructor };
  const Constructor = scope.NDEFReader;
  if (!Constructor) return null;
  try {
    return new Constructor();
  } catch {
    return null;
  }
}

function parseAmount(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round(amount);
}

function deltaLabel(delta: number): string {
  if (delta === 0) return "Tanpa perubahan";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatRupiah(Math.abs(delta))}`;
}

/**
 * Cek saldo kartu.
 *
 * The balance is a ledger the rider keeps. A real Web NFC tap proves the
 * card is there; it cannot read the stored value of a JakLingko card, so
 * the number still comes from the rider. The simulator replays that same
 * number and never invents one.
 */
export function CardBalanceView({ onBack }: { onBack: () => void }) {
  const [card, setCard] = useState<TransitCardState>(() => readTransitCard());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Saldo tercatat");
  const [formError, setFormError] = useState<string | null>(null);
  const [rippling, setRippling] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  const hasNfc = nfcSupported();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const ripple = (): void => {
    setRippling(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setRippling(false), 1600);
  };

  const manual = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = parseAmount(amount);
    if (value === null) {
      setFormError("Tulis saldo antara Rp1 dan Rp10.000.000.");
      return;
    }
    setCard(recordManualBalance(value, note));
    setAmount("");
    setFormError(null);
    ripple();
  };

  const simulate = (): void => {
    setCard(simulateCardTap());
    setNfcError(null);
    ripple();
  };

  const startNfc = async (): Promise<void> => {
    const reader = nfcReader();
    if (!reader) {
      setNfcError("Browser ini belum bisa membaca NFC.");
      return;
    }
    setNfcError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    reader.onreading = () => {
      setCard(recordNfcTap());
      setScanning(false);
      ripple();
      // The tap proves the card; the machine owns the number. The rider
      // confirms it below instead of trusting a value no reader sent.
      setNote("Saldo setelah tap NFC");
      requestAnimationFrame(() => {
        document.getElementById("card-balance-field")?.focus();
      });
    };
    reader.onreadingerror = () => {
      setScanning(false);
      setNfcError("Kartu tidak terbaca. Coba lagi, atau catat saldo manual.");
    };
    setScanning(true);
    try {
      await reader.scan({ signal: controller.signal });
    } catch {
      setScanning(false);
      setNfcError("Pemindaian NFC tidak bisa dimulai. Catat saldo manual.");
    }
  };

  const stopNfc = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  };

  const belowThreshold =
    card.balanceIdr !== null &&
    card.remindLowBalance &&
    card.balanceIdr < card.lowBalanceThresholdIdr;

  return (
    <div className="m3-saya-view">
      <header className="m3-saya-view__head">
        <M3IconButton label="Kembali ke Saya" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="m3-tl m3-em text-m3-on-surface">Saldo kartu</h1>
          <p className="m3-bs mt-1 text-m3-on-surface-variant">
            Catatan pribadi, bukan saldo resmi
          </p>
        </div>
      </header>

      <div className="m3-saya-view__scroll">
        <div className="grid gap-4 px-4 pb-6">
          <section
            aria-label="Kartu dan saldo"
            className="m3-card-stage"
            data-rippling={rippling || undefined}
          >
            <span aria-hidden className="m3-card-stage__ring m3-card-stage__ring--1" />
            <span aria-hidden className="m3-card-stage__ring m3-card-stage__ring--2" />
            <span aria-hidden className="m3-card-stage__ring m3-card-stage__ring--3" />

            <div className="m3-card-visual" data-scanning={scanning || undefined}>
              <span className="flex items-start justify-between gap-2">
                <span className="m3-lm uppercase tracking-[0.08em]">KARTU</span>
                <Nfc aria-hidden className="size-5" />
              </span>
              <span className="grid gap-1">
                <span className="m3-bs opacity-80">JakLingko · Uang elektronik</span>
                <span className="m3-card-visual__balance tabular-nums">
                  {card.balanceIdr === null ? "Belum dicatat" : formatRupiah(card.balanceIdr)}
                </span>
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="m3-lm">{card.cardLabel}</span>
                <span className="m3-bs opacity-80">
                  {card.lastReadAt
                    ? `Dibaca ${formatDateTime(card.lastReadAt)}`
                    : "Belum pernah dibaca"}
                </span>
              </span>
            </div>
          </section>

          {belowThreshold ? (
            <M3Card variant="error-container" radius="lg" className="flex items-start gap-3 p-4">
              <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div className="grid gap-1">
                <p className="m3-tm">Saldo di bawah {formatRupiah(card.lowBalanceThresholdIdr)}</p>
                <p className="m3-bm">Isi ulang sebelum naik, supaya tidak tertahan di gate.</p>
              </div>
            </M3Card>
          ) : null}

          {card.balanceIdr !== null && !card.remindLowBalance ? (
            <p className="m3-bs px-1 text-m3-on-surface-variant">
              Pengingat saldo rendah sedang mati.
            </p>
          ) : null}

          <M3Card variant="filled" radius="xl" className="grid gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="m3-tm text-m3-on-surface">Pengingat saldo rendah</p>
                <p className="m3-bs text-m3-on-surface-variant">
                  Ingatkan kalau di bawah {formatRupiah(LOW_BALANCE_DEFAULT_IDR)}
                </p>
              </div>
              <M3Switch
                aria-label="Ingatkan kalau saldo di bawah Rp20.000"
                checked={card.remindLowBalance}
                onCheckedChange={(checked) =>
                  setCard(saveTransitCard({ remindLowBalance: checked }))
                }
              />
            </div>
          </M3Card>

          <section aria-label="Catat saldo" className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m3-ll text-m3-on-surface-variant">Catat saldo manual</h2>
              <M3Chip
                variant="suggestion"
                selected={false}
                onClick={() => {
                  setNote("Isi ulang");
                  document.getElementById("card-balance-field")?.focus();
                }}
              >
                Catat isi ulang
              </M3Chip>
            </div>
            <form onSubmit={manual} className="grid gap-3">
              <Input
                id="card-balance-field"
                label="Saldo di kartu"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Contoh 50000"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                hint="Rupiah. Tulis angka yang tampil di mesin atau aplikasi resmi."
              />
              <Input
                label="Catatan"
                placeholder="Saldo awal, isi ulang, atau setelah tap"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {formError ? (
                <p role="alert" className="m3-bs text-m3-error">
                  {formError}
                </p>
              ) : null}
              <M3Button
                type="submit"
                size="m"
                fullWidth
                icon={<Wallet aria-hidden />}
                disabled={amount.trim().length === 0}
              >
                Simpan saldo
              </M3Button>
            </form>
          </section>

          <section aria-label="Baca kartu" className="grid gap-2">
            <h2 className="m3-ll text-m3-on-surface-variant">Baca kartu</h2>
            {hasNfc ? (
              <M3Button
                variant="tonal"
                fullWidth
                icon={<Nfc aria-hidden className="size-5" />}
                onClick={() => {
                  if (scanning) stopNfc();
                  else void startNfc();
                }}
              >
                {scanning ? "Berhenti memindai" : "Tap kartu lewat NFC"}
              </M3Button>
            ) : (
              <p className="m3-bs text-m3-on-surface-variant">
                Perangkat ini tidak punya Web NFC. Catat saldo manual atau pakai simulasi
                di bawah.
              </p>
            )}
            {nfcError ? (
              <p role="alert" className="m3-bs text-m3-error">
                {nfcError}
              </p>
            ) : null}

            <div className="m3-sim-note grid gap-2 rounded-[14px] bg-m3-surface-container px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="m3-chip is-selected" aria-hidden>
                  Simulasi
                </span>
                <span className="m3-bs text-m3-on-surface-variant">Mode simulasi</span>
              </div>
              <p className="m3-bs text-m3-on-surface-variant">
                Tombol ini hanya mengulang saldo yang sudah kamu catat, tanpa membaca
                kartu dan tanpa mengubah angkanya.
              </p>
              <M3Button
                variant="outlined"
                fullWidth
                icon={<BadgeCheck aria-hidden className="size-4" />}
                onClick={simulate}
              >
                Simulasikan tap
              </M3Button>
            </div>
          </section>

          <section aria-label="Riwayat kartu" className="grid gap-2">
            <h2 className="m3-ll text-m3-on-surface-variant">Riwayat</h2>
            {card.history.length === 0 ? (
              <M3Card variant="filled" radius="lg" className="grid gap-2 p-4">
                <p className="m3-tm">Belum ada catatan</p>
                <p className="m3-bm">
                  Saldo yang kamu simpan muncul di sini bersama waktunya.
                </p>
              </M3Card>
            ) : (
              <M3ExpressiveList ariaLabel="Riwayat saldo" surface="low">
                {card.history.map((entry) => (
                  <M3ExpressiveListItem
                    key={entry.id}
                    leading={<CreditCard aria-hidden />}
                    leadingShape={entry.simulated ? "sunny" : "cookie9"}
                    leadingTone={entry.simulated ? "tertiary" : "primary"}
                    title={entry.label}
                    subtitle={`${formatDateTime(entry.timestamp)} WIB`}
                    trailing={
                      <span className="grid justify-items-end gap-1">
                        <span className="m3-ll tabular-nums text-m3-on-surface">
                          {deltaLabel(entry.deltaIdr)}
                        </span>
                        {entry.simulated ? (
                          <span className="m3-bs text-m3-on-surface-variant">Simulasi</span>
                        ) : null}
                      </span>
                    }
                  />
                ))}
              </M3ExpressiveList>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <M3Button
              variant="text"
              icon={<RotateCcw aria-hidden className="size-4" />}
              onClick={() => setConfirmReset(true)}
              disabled={card.history.length === 0 && card.balanceIdr === null}
            >
              Reset catatan
            </M3Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset catatan kartu"
        description="Saldo, riwayat, dan pengingat di perangkat ini dihapus. Kartu aslinya tidak berubah."
        confirmLabel="Reset"
        cancelLabel="Batal"
        tone="danger"
        onConfirm={() => {
          setCard(resetTransitCard());
          setConfirmReset(false);
          setAmount("");
          setNote("Saldo tercatat");
        }}
      />
    </div>
  );
}
