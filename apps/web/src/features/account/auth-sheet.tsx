import {
  ArrowLeft,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { M3Button, M3ConnectedButtonGroup, M3IconButton, M3Shape } from "../../components/m3e/index.js";
import { Input } from "../../components/ui/input.js";
import { ApiError, type AccountUser } from "../../lib/api.js";

export type AuthSheetProps = {
  /** The signed-in rider, when the session already exists. */
  user: AccountUser | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  /** Called after a successful sign-in or account creation. */
  onSignedIn?: () => void;
  /** Continue without an account. */
  onGuest: () => void;
  /** Present when the surface is a sheet that can be dismissed. */
  onClose?: () => void;
  variant?: "sheet" | "onboarding";
};

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Permintaan tidak bisa diselesaikan. Coba lagi.";
}

/**
 * Masuk.
 *
 * The only authentication here is the real email and password session the
 * API owns. There is no phone code and no third-party provider, because
 * the server has neither: inventing one would produce a screen that cannot
 * sign anybody in.
 */
export function AuthSheet({
  user,
  onSignIn,
  onSignUp,
  onSignedIn,
  onGuest,
  onClose,
  variant = "sheet",
}: AuthSheetProps) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const mismatch = mode === "create" && confirm.length > 0 && password !== confirm;
  const missing =
    email.trim().length === 0 ||
    password.length === 0 ||
    (mode === "create" && confirm.length === 0);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (mismatch || missing) return;
    setBusy(true);
    setFormError(null);
    try {
      if (mode === "signin") await onSignIn(email.trim(), password);
      else await onSignUp(email.trim(), password);
      setPassword("");
      setConfirm("");
      setShown(false);
      onSignedIn?.();
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m3-auth">
      <div className="m3-auth__banner" aria-hidden>
        <M3Shape
          shape="cookie12"
          size={168}
          className="m3-auth__shape m3-auth__shape--a"
        />
        <M3Shape shape="sunny" size={96} className="m3-auth__shape m3-auth__shape--b" />
        <M3Shape shape="softburst" size={64} className="m3-auth__shape m3-auth__shape--c" />
        <M3Shape shape="cookie9" size={40} className="m3-auth__shape m3-auth__shape--d" />
      </div>

      <div className="m3-auth__surface m3-rise">
        <div className="flex items-start gap-2">
          {onClose ? (
            <M3IconButton label="Kembali" onClick={onClose}>
              <ArrowLeft aria-hidden />
            </M3IconButton>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="m3-hm m3-em text-m3-on-surface">Halo, komuter.</h1>
            <p className="m3-bm mt-1 text-m3-on-surface-variant">
              {variant === "onboarding"
                ? "Masuk supaya tempat dan rutinitasmu ikut ke perangkat lain."
                : "Masuk untuk menyinkronkan tempat, rutinitas, dan pengingat."}
            </p>
          </div>
        </div>

        {user ? (
          <div className="grid gap-3">
            <p className="m3-bm flex items-center gap-2 text-m3-on-surface">
              <ShieldCheck aria-hidden className="size-5 text-m3-primary" />
              <span className="min-w-0 truncate">{user.email}</span>
            </p>
            <M3Button
              size="m"
              fullWidth
              onClick={() => {
                if (onSignedIn) onSignedIn();
                else onGuest();
              }}
            >
              Lanjut
            </M3Button>
          </div>
        ) : (
          <>
            <M3ConnectedButtonGroup
              ariaLabel="Pilih masuk atau buat akun"
              size="s"
              value={mode}
              onChange={(value) => {
                if (value !== "signin" && value !== "create") return;
                setMode(value);
                setFormError(null);
                setConfirm("");
              }}
              options={[
                { value: "signin", label: "Masuk" },
                { value: "create", label: "Buat akun" },
              ]}
            />

            <form onSubmit={submit} className="grid gap-3">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                label="Kata sandi"
                type={shown ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "create" ? "Minimal 8 karakter" : "Kata sandi kamu"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
              {mode === "create" ? (
                <Input
                  label="Ulangi kata sandi"
                  type={shown ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Tulis ulang kata sandi"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  invalid={mismatch}
                />
              ) : null}

              {mismatch ? (
                <p role="alert" className="m3-bs text-m3-error">
                  Kata sandi belum sama.
                </p>
              ) : null}
              {formError ? (
                <p role="alert" className="m3-bs text-m3-error">
                  {formError}
                </p>
              ) : null}

              <M3Button
                type="submit"
                size="m"
                fullWidth
                icon={
                  mode === "signin" ? (
                    <LogIn aria-hidden />
                  ) : (
                    <UserPlus aria-hidden />
                  )
                }
                disabled={busy || missing || mismatch}
              >
                {busy
                  ? mode === "signin"
                    ? "Masuk"
                    : "Membuat akun"
                  : mode === "signin"
                    ? "Masuk"
                    : "Buat akun"}
              </M3Button>
            </form>
          </>
        )}

        <div className="grid gap-2 border-t border-m3-outline-variant pt-4">
          <M3Button variant="text" fullWidth onClick={onGuest}>
            Jelajahi tanpa akun
          </M3Button>
          <p className="m3-bs text-m3-on-surface-variant">
            Rute, peta, dan perjalanan live tetap bisa dipakai tanpa akun. Yang tersimpan
            hanya di perangkat ini.
          </p>
        </div>
      </div>
    </div>
  );
}
