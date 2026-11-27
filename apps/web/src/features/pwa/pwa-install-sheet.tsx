import {
  Bell,
  BellRing,
  CheckCircle2,
  Download,
  Home,
  Info,
  Share,
  SquarePlus,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import {
  M3Button,
  M3Card,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3IconButton,
  M3Shape,
  M3Switch,
} from "../../components/m3e/index.js";
import { usePwa } from "./pwa-context.js";
import type { PwaEnvironment } from "./pwa-utils.js";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function useSheetFocus(
  open: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose, open, panelRef]);
}

export type PwaInstallSheetProps = {
  /** Override the provider state for a preview or a test. */
  open?: boolean;
  onClose?: () => void;
  /** Preview one guide without changing the detected platform. */
  guide?: PwaInstallGuide;
};

export type PwaInstallGuide = "installed" | "ios" | "browser";

/** Which guide the current platform needs. */
export function installGuideOf(
  environment: PwaEnvironment,
  isInstalled: boolean,
): PwaInstallGuide {
  if (isInstalled) return "installed";
  return environment.platform === "ios" ? "ios" : "browser";
}

/**
 * The platform-aware install guide.
 *
 * Android and a Chromium desktop get the native prompt when the browser
 * exposes it. iPhone and iPad get the real Safari Share menu route, because
 * no browser on iOS can install through a button. A rider who already runs
 * Daily from the Home Screen gets the two notification actions instead.
 */
export function PwaInstallSheet({
  open: openOverride,
  onClose,
  guide: guideOverride,
}: PwaInstallSheetProps) {
  const pwa = usePwa();
  const open = openOverride ?? pwa.installSheetOpen;
  const close = onClose ?? pwa.closeInstallSheet;
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useSheetFocus(open, panelRef, close);

  if (!open) return null;

  const guide = guideOverride ?? installGuideOf(pwa.environment, pwa.isInstalled);
  const heading =
    guide === "installed"
      ? "Daily sudah terpasang"
      : guide === "ios"
        ? "Pasang Daily di iPhone"
        : "Pasang Daily di layar utama";

  const sendTestNotification = async (): Promise<void> => {
    const sent = await pwa.sendLocalNotification({
      title: "Daily",
      body: "Notifikasi uji berhasil. Info gangguan akan muncul di sini.",
      tag: "daily-test",
      url: "/",
    });
    setTestMessage(
      sent
        ? "Notifikasi uji dikirim."
        : "Notifikasi belum bisa dikirim. Periksa izin di pengaturan browser.",
    );
  };

  const install = async (): Promise<void> => {
    const outcome = await pwa.promptInstall();
    if (outcome === "accepted") close();
  };

  return (
    <div
      className="pwa-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className="pwa-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pwa-sheet-body">
          <div className="pwa-sheet-head">
            <h2 id={headingId} className="m3-hs">
              {heading}
            </h2>
            <M3IconButton label="Tutup" title="Tutup" onClick={close}>
              <X />
            </M3IconButton>
          </div>

          {guide === "installed" ? (
            <div className="grid gap-4">
              <M3Card variant="ok-container" radius="lg" className="flex items-center gap-3">
                <M3Shape shape="cookie9" size={40} className="pwa-confirm-mark">
                  <CheckCircle2 aria-hidden="true" />
                </M3Shape>
                <div className="grid gap-1">
                  <p className="m3-tm">Daily sudah terpasang</p>
                  <p className="m3-bs">Buka dari ikon layar utama untuk mode layar penuh.</p>
                </div>
              </M3Card>

              <M3Card variant="filled" radius="lg" className="grid gap-4">
                <div className="grid gap-1">
                  <p className="m3-tm">{pwa.notificationCapability.title}</p>
                  <p className="m3-bs text-m3-on-surface-variant">
                    {pwa.notificationCapability.explanation}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <p className="m3-tm">Getaran</p>
                    <p className="m3-bs text-m3-on-surface-variant">
                      Getarkan perangkat saat notifikasi muncul.
                    </p>
                  </div>
                  <M3Switch
                    checked={pwa.hapticsEnabled}
                    onCheckedChange={pwa.setHapticsEnabled}
                    aria-label="Getarkan perangkat saat notifikasi muncul"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {pwa.notificationCapability.status === "prompt" ? (
                    <M3Button
                      variant="filled"
                      icon={<Bell />}
                      onClick={() => {
                        void pwa.requestNotificationPermission();
                      }}
                    >
                      Aktifkan notifikasi
                    </M3Button>
                  ) : null}
                  {pwa.notificationCapability.status === "ready" ? (
                    <M3Button
                      variant="tonal"
                      icon={<BellRing />}
                      onClick={() => {
                        void sendTestNotification();
                      }}
                    >
                      Kirim notifikasi uji
                    </M3Button>
                  ) : null}
                </div>

                {testMessage ? (
                  <p className="m3-bs text-m3-on-surface-variant" role="status">
                    {testMessage}
                  </p>
                ) : null}
              </M3Card>

              <M3Button variant="text" fullWidth onClick={close}>
                Tutup
              </M3Button>
            </div>
          ) : guide === "ios" ? (
            <div className="grid gap-4">
              {pwa.environment.isIosInAppOrNonSafari ? (
                <M3Card variant="tertiary-container" radius="lg" className="grid gap-2">
                  <p className="m3-tm">Buka tautan ini di Safari</p>
                  <p className="m3-bm">
                    Browser di dalam aplikasi dan browser lain di iPhone belum bisa memasang Daily.
                    Buka tautan ini di Safari, lalu ikuti langkah di bawah.
                  </p>
                </M3Card>
              ) : null}

              <M3ExpressiveList ariaLabel="Langkah memasang Daily di iPhone">
                <M3ExpressiveListItem
                  className="pwa-step"
                  leading={<Share />}
                  leadingShape="cookie6"
                  leadingTone="primary"
                  title="Ketuk Bagikan"
                  subtitle="Tombol Bagikan ada di bilah bawah Safari."
                />
                <M3ExpressiveListItem
                  className="pwa-step"
                  leading={<SquarePlus />}
                  leadingShape="cookie6"
                  leadingTone="secondary"
                  title="Pilih Tambahkan ke Layar Utama"
                  subtitle="Geser daftar ke bawah, lalu ketuk Tambahkan ke Layar Utama."
                />
                <M3ExpressiveListItem
                  className="pwa-step"
                  leading={<Home />}
                  leadingShape="cookie6"
                  leadingTone="tertiary"
                  title="Ketuk Tambah dan buka Daily"
                  subtitle="Buka dari ikon layar utama untuk mode layar penuh dan notifikasi."
                />
              </M3ExpressiveList>

              <div className="grid gap-2">
                <M3Button variant="filled" fullWidth onClick={close}>
                  Mengerti
                </M3Button>
                <M3Button variant="text" fullWidth onClick={pwa.dismissInstallNudge}>
                  Nanti saja
                </M3Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="pwa-hero">
                <M3Shape shape="cookie12" size={96} className="pwa-hero-mark">
                  <img src="/icons/icon-192.png" alt="" width={96} height={96} />
                </M3Shape>
                <div className="grid gap-2">
                  <h3 className="m3-hs">Pasang Daily di layar utama</h3>
                  <p className="m3-bm text-m3-on-surface-variant">
                    Akses lebih cepat dan tetap bisa dibaca saat sinyal lemah.
                  </p>
                </div>
              </div>

              <M3ExpressiveList ariaLabel="Keuntungan memasang Daily">
                <M3ExpressiveListItem
                  className="pwa-benefit"
                  leading={<Zap />}
                  leadingShape="cookie6"
                  leadingTone="primary"
                  title="Buka instan layar penuh"
                  subtitle="Tanpa bilah alamat dan tanpa menunggu."
                />
                <M3ExpressiveListItem
                  className="pwa-benefit"
                  leading={<BellRing />}
                  leadingShape="cookie6"
                  leadingTone="secondary"
                  title="Notifikasi gangguan dan alarm turun"
                  subtitle="Info jalur dan pengingat saat harus turun."
                />
                <M3ExpressiveListItem
                  className="pwa-benefit"
                  leading={<WifiOff />}
                  leadingShape="cookie6"
                  leadingTone="tertiary"
                  title="Tetap bisa baca jadwal saat sinyal lemah"
                  subtitle="Jalur dan halte tersimpan di perangkat."
                />
              </M3ExpressiveList>

              {pwa.canPromptInstall ? (
                <div className="grid gap-2">
                  <M3Button
                    variant="filled"
                    size="m"
                    fullWidth
                    icon={<Download />}
                    onClick={() => {
                      void install();
                    }}
                  >
                    Pasang sekarang
                  </M3Button>
                  <M3Button variant="text" fullWidth onClick={pwa.dismissInstallNudge}>
                    Nanti saja
                  </M3Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <M3Card
                    variant="tertiary-container"
                    radius="lg"
                    className="flex items-start gap-3"
                  >
                    <Info aria-hidden="true" className="pwa-tip-icon" />
                    <p className="m3-bm">
                      Buka menu browser, lalu pilih Instal Daily atau Tambahkan ke Layar Utama.
                    </p>
                  </M3Card>
                  <M3Button variant="tonal" fullWidth onClick={pwa.dismissInstallNudge}>
                    Mengerti
                  </M3Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
