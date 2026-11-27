import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  M3Button,
  M3Card,
  M3ConnectedButtonGroup,
  M3IconButton,
  M3Shape,
  M3Slider,
  M3Switch,
} from "../../components/m3e/index.js";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.js";
import { Input } from "../../components/ui/input.js";
import { ApiError, type AccountUser } from "../../lib/api.js";
import { SEED_IDS, SEED_PRESETS, useTheme, type ThemeMode } from "../../lib/theme.js";
import { PwaNotificationCard, usePwa } from "../pwa/index.js";
import {
  ALERT_SENSITIVITY_OPTIONS,
  useRiderPreferences,
  type AlertSensitivity,
} from "./rider-preferences.js";

export type SettingsViewProps = {
  user: AccountUser | null;
  accountPending: boolean;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  onOpenAuth: () => void;
  onOpenOnboarding: () => void;
  /** Scroll to the account block, from "Akun & sinkronisasi". */
  initialAccount?: boolean;
  onBack: () => void;
};

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Permintaan tidak bisa diselesaikan. Coba lagi.";
}

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="m3-tm text-m3-on-surface">{title}</p>
        {detail ? <p className="m3-bs text-m3-on-surface-variant">{detail}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Pengaturan.
 *
 * Two kinds of choice share this screen. A preference changes this browser
 * at once and never leaves it; an account action is a real request to the
 * API. The rows say which is which.
 */
export function SettingsView({
  user,
  accountPending,
  onChangePassword,
  onSignOut,
  onDeleteAccount,
  onOpenAuth,
  onOpenOnboarding,
  initialAccount = false,
  onBack,
}: SettingsViewProps) {
  const { theme, mode, seed, setMode, setSeed } = useTheme();
  const { preferences, update } = useRiderPreferences();
  const pwa = usePwa();
  const [shown, setShown] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const accountRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!initialAccount) return;
    accountRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [initialAccount]);

  const changePassword = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setAccountError(null);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setShown(false);
    } catch (error) {
      setAccountError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setBusy(true);
    setAccountError(null);
    try {
      await onSignOut();
      setConfirmSignOut(false);
    } catch (error) {
      setAccountError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    setBusy(true);
    setAccountError(null);
    try {
      await onDeleteAccount(deletePassword);
      setDeletePassword("");
      setConfirmDelete(false);
    } catch (error) {
      setAccountError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const install = (): void => {
    if (!pwa.canPromptInstall) {
      pwa.openInstallSheet();
      return;
    }
    void pwa.promptInstall().then((outcome) => {
      if (outcome === "unavailable") pwa.openInstallSheet();
    });
  };

  return (
    <div className="m3-saya-view">
      <header className="m3-saya-view__head">
        <M3IconButton label="Kembali ke Saya" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="m3-tl m3-em text-m3-on-surface">Pengaturan</h1>
          <p className="m3-bs mt-1 text-m3-on-surface-variant">
            Rute, agent, tampilan, dan akun
          </p>
        </div>
      </header>

      <div className="m3-saya-view__scroll">
        <div className="grid gap-4 px-4 pb-6">
          <section aria-label="Rute" className="grid gap-2">
            <h2 className="m3-lm uppercase tracking-[0.08em] text-m3-primary">Rute</h2>
            <M3Card variant="filled" radius="xl" className="grid gap-4 p-4">
              <div className="grid gap-2">
                <p className="m3-tm text-m3-on-surface">Prioritas utama</p>
                <M3ConnectedButtonGroup
                  ariaLabel="Prioritas utama"
                  size="s"
                  value={preferences.priority}
                  onChange={(value) => {
                    if (
                      value === "fastest" ||
                      value === "cheapest" ||
                      value === "fewest-transfers"
                    ) {
                      update({ priority: value });
                    }
                  }}
                  options={[
                    { value: "fastest", label: "Cepat" },
                    { value: "cheapest", label: "Murah" },
                    { value: "fewest-transfers", label: "Nyaman" },
                  ]}
                />
              </div>

              <M3Slider
                label="Maks. jalan kaki"
                value={preferences.maxWalkMeters}
                min={200}
                max={1500}
                step={100}
                valueLabel={`${preferences.maxWalkMeters} m`}
                onChange={(value) => update({ maxWalkMeters: value })}
              />

              <Row
                title="Rute ramah kursi roda"
                detail="Utamakan akses tanpa tangga saat ada pilihan."
              >
                <M3Switch
                  aria-label="Rute ramah kursi roda"
                  checked={preferences.wheelchairFriendly}
                  onCheckedChange={(checked) => update({ wheelchairFriendly: checked })}
                />
              </Row>
            </M3Card>
          </section>

          <section aria-label="Daily Agent" className="grid gap-2">
            <h2 className="m3-lm uppercase tracking-[0.08em] text-m3-primary">Daily Agent</h2>
            <M3Card variant="filled" radius="xl" className="grid gap-4 p-4">
              <Row
                title="Ikutkan laporan warga dari X"
                detail="Baca akun operator dan warga, lalu sebutkan sumbernya."
              >
                <M3Switch
                  aria-label="Ikutkan laporan warga dari X"
                  checked={preferences.includeCitizenX}
                  onCheckedChange={(checked) => update({ includeCitizenX: checked })}
                />
              </Row>
              <div className="grid gap-2">
                <p className="m3-tm text-m3-on-surface">Kepekaan peringatan</p>
                <M3ConnectedButtonGroup
                  ariaLabel="Kepekaan peringatan"
                  size="s"
                  value={preferences.alertSensitivity}
                  onChange={(value) => {
                    if (value === "important" || value === "balanced" || value === "all") {
                      update({ alertSensitivity: value as AlertSensitivity });
                    }
                  }}
                  options={ALERT_SENSITIVITY_OPTIONS.map((option) => ({ ...option }))}
                />
                <p className="m3-bs text-m3-on-surface-variant">
                  {preferences.alertSensitivity === "important"
                    ? "Hanya gangguan yang menutup jalur."
                    : preferences.alertSensitivity === "all"
                      ? "Setiap kabar, termasuk yang belum terverifikasi."
                      : "Gangguan besar dan perubahan yang sudah terverifikasi."}
                </p>
              </div>
            </M3Card>
          </section>

          <section aria-label="Tampilan" className="grid gap-2">
            <h2 className="m3-lm uppercase tracking-[0.08em] text-m3-primary">Tampilan</h2>
            <M3Card variant="filled" radius="xl" className="grid gap-4 p-4">
              <div className="grid gap-2">
                <p className="m3-tm text-m3-on-surface">Tema</p>
                <M3ConnectedButtonGroup
                  ariaLabel="Tema"
                  size="s"
                  value={mode}
                  onChange={(value) => {
                    if (value === "system" || value === "light" || value === "dark") {
                      setMode(value as ThemeMode);
                    }
                  }}
                  options={[
                    { value: "system", label: "Sistem" },
                    { value: "light", label: "Terang" },
                    { value: "dark", label: "Gelap" },
                  ]}
                />
                <p className="m3-bs text-m3-on-surface-variant">
                  Tema terang atau gelap tidak mengubah warna operator.
                </p>
              </div>

              <div className="grid gap-2">
                <p className="m3-tm text-m3-on-surface">Warna utama</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Warna utama">
                  {SEED_IDS.map((id) => {
                    const preset = SEED_PRESETS[id];
                    const active = seed === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`m3-seed-swatch ${active ? "is-active" : ""}`}
                        style={{ backgroundColor: preset.swatchHex }}
                        aria-label={`Warna ${preset.label}`}
                        aria-pressed={active}
                        onClick={() => setSeed(id)}
                      >
                        {active ? <Check aria-hidden className="size-5" /> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="m3-bs text-m3-on-surface-variant">
                  Enam warna, terang dan gelap. Pilih satu, seluruh halaman ikut berganti.
                </p>
              </div>
            </M3Card>
          </section>

          <section aria-label="Aplikasi dan notifikasi" className="grid gap-2">
            <h2 className="m3-lm uppercase tracking-[0.08em] text-m3-primary">
              Aplikasi & notifikasi
            </h2>
            <PwaNotificationCard />
            <M3Card variant="filled" radius="xl" className="grid gap-2 p-4">
              <M3Button
                variant="tonal"
                fullWidth
                icon={<Download aria-hidden className="size-4" />}
                onClick={install}
                disabled={pwa.isInstalled}
              >
                {pwa.isInstalled ? "Daily sudah terpasang" : "Pasang Daily"}
              </M3Button>
              <p className="m3-bs text-m3-on-surface-variant">
                {pwa.notificationCapability.status === "ready"
                  ? "Notifikasi memakai izin perangkat. Daily tidak mengirim pesan tanpa izin itu."
                  : pwa.notificationCapability.status === "needs-ios-install"
                    ? "Di iOS, pasang Daily ke layar utama dulu untuk mengaktifkan notifikasi."
                    : pwa.notificationCapability.explanation}
              </p>
            </M3Card>
            <M3Card variant="filled" radius="xl" className="p-2">
              <button type="button" className="m3-settings-link" onClick={onOpenOnboarding}>
                <M3Shape
                  shape="sunny"
                  size={36}
                  className="bg-m3-secondary-container text-m3-on-secondary-container"
                >
                  <RefreshCw aria-hidden className="size-4" />
                </M3Shape>
                <span className="min-w-0 flex-1 text-left">
                  <span className="m3-tm block text-m3-on-surface">
                    Ulangi tur pengenalan
                  </span>
                  <span className="m3-bs block text-m3-on-surface-variant">
                    Lihat lagi tujuh moda, agent, dan rute cadangan.
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0" />
              </button>
            </M3Card>
          </section>

          <section ref={accountRef} aria-label="Akun" className="grid gap-2">
            <h2 className="m3-lm uppercase tracking-[0.08em] text-m3-primary">Akun</h2>
            {user ? (
              <div className="grid gap-2">
                <M3Card variant="filled" radius="xl" className="grid gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <M3Shape
                      shape="cookie9"
                      size={48}
                      className="shrink-0 bg-m3-primary-container text-m3-on-primary-container"
                    >
                      <UserRound aria-hidden className="size-5" />
                    </M3Shape>
                    <div className="min-w-0">
                      <p className="m3-tm truncate text-m3-on-surface">{user.email}</p>
                      <p className="m3-bs text-m3-on-surface-variant">
                        Tempat dan rutinitas ikut akun ini.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={(event) => void changePassword(event)} className="grid gap-3">
                    <p className="m3-ll flex items-center gap-2 text-m3-on-surface-variant">
                      <KeyRound aria-hidden className="size-4" />
                      Ubah kata sandi
                    </p>
                    <Input
                      label="Kata sandi sekarang"
                      type={shown ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Kata sandi yang kamu pakai"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                    <Input
                      label="Kata sandi baru"
                      type={shown ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Minimal 8 karakter"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      trailing={
                        <M3IconButton
                          label={shown ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                          size="s"
                          onClick={() => setShown((current) => !current)}
                        >
                          {shown ? (
                            <EyeOff aria-hidden className="size-4" />
                          ) : (
                            <Eye aria-hidden className="size-4" />
                          )}
                        </M3IconButton>
                      }
                    />
                    {accountError && !confirmDelete && !confirmSignOut ? (
                      <p role="alert" className="m3-bs text-m3-error">
                        {accountError}
                      </p>
                    ) : null}
                    <M3Button
                      type="submit"
                      variant="tonal"
                      fullWidth
                      disabled={busy || currentPassword.length === 0 || newPassword.length === 0}
                    >
                      Ubah kata sandi
                    </M3Button>
                  </form>

                  <div className="grid gap-2">
                    <M3Button
                      variant="text"
                      fullWidth
                      icon={<LogOut aria-hidden className="size-4" />}
                      onClick={() => {
                        setAccountError(null);
                        setConfirmSignOut(true);
                      }}
                    >
                      Keluar dari akun
                    </M3Button>
                    <M3Button
                      variant="text"
                      fullWidth
                      className="text-m3-error"
                      icon={<Trash2 aria-hidden className="size-4" />}
                      onClick={() => {
                        setAccountError(null);
                        setDeletePassword("");
                        setConfirmDelete(true);
                      }}
                    >
                      Hapus akun
                    </M3Button>
                  </div>
                </M3Card>
              </div>
            ) : (
              <M3Card variant="secondary-container" radius="xl" className="grid gap-3 p-4">
                <p className="m3-tm">
                  {accountPending ? "Memeriksa sesi" : "Belum masuk"}
                </p>
                <p className="m3-bm">
                  Tanpa akun, Daily tetap menghitung rute. Tempat dan rutinitas hanya
                  tinggal di perangkat ini.
                </p>
                <M3Button
                  variant="filled"
                  icon={<LogIn aria-hidden className="size-4" />}
                  onClick={onOpenAuth}
                >
                  Masuk atau buat akun
                </M3Button>
              </M3Card>
            )}

            <p className="m3-bs flex items-center gap-2 px-1 text-m3-on-surface-variant">
              <Mail aria-hidden className="size-4 shrink-0" />
              Sesi disimpan sebagai cookie HttpOnly. Tidak ada kata sandi di browser.
            </p>
          </section>

          <p className="m3-bs px-1 text-m3-on-surface-variant">
            Tema saat ini: {theme === "dark" ? "gelap" : "terang"}, mengikuti{" "}
            {mode === "system" ? "sistem" : "pilihanmu"}.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Keluar dari akun"
        description="Tempat dan rutinitas tetap di akun ini. Perangkat ini tidak menyimpan salinannya."
        confirmLabel="Keluar"
        cancelLabel="Tetap masuk"
        busy={busy}
        busyLabel="Keluar"
        error={confirmSignOut ? accountError : null}
        onConfirm={() => void signOut()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(next) => {
          setConfirmDelete(next);
          if (!next) {
            setDeletePassword("");
            setAccountError(null);
          }
        }}
        title="Hapus akun"
        description="Tempat dan rutinitas yang tersimpan dengan akun ini ikut terhapus. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus akun"
        cancelLabel="Simpan akun"
        tone="danger"
        busy={busy}
        busyLabel="Menghapus akun"
        confirmDisabled={deletePassword.length === 0}
        error={confirmDelete ? accountError : null}
        onConfirm={() => void deleteAccount()}
      >
        <Input
          label="Kata sandi"
          type="password"
          autoComplete="current-password"
          placeholder="Kata sandi akun ini"
          value={deletePassword}
          onChange={(event) => setDeletePassword(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
