import { Bell, BellRing, Download, Smartphone } from "lucide-react";
import { useState } from "react";

import { M3Button, M3Card, M3Shape, M3Switch } from "../../components/m3e/index.js";
import { cn } from "../../lib/cn.js";
import { usePwa } from "./pwa-context.js";

export type PwaBannerProps = {
  className?: string;
};

/**
 * A compact nudge for the map home and the settings surface.
 *
 * It offers the install guide only while the rider still needs it, and the
 * notification permission only after Daily is installed. Once both are done,
 * or the rider dismisses the row, it renders nothing.
 */
export function PwaInstallBanner({ className }: PwaBannerProps) {
  const pwa = usePwa();

  const install = async (): Promise<void> => {
    if (!pwa.canPromptInstall) {
      pwa.openInstallSheet();
      return;
    }
    const outcome = await pwa.promptInstall();
    if (outcome === "unavailable") pwa.openInstallSheet();
  };

  if (pwa.installNudgeVisible) {
    return (
      <M3Card
        variant="primary-container"
        radius="lg"
        className={cn("grid gap-3", className)}
      >
        <div className="flex items-start gap-3">
          <M3Shape shape="cookie9" size={40} className="pwa-banner-mark">
            <Download aria-hidden="true" />
          </M3Shape>
          <div className="grid gap-1">
            <p className="m3-tm">Pasang Daily</p>
            <p className="m3-bs">
              Buka lebih cepat dan tetap bisa dibaca saat sinyal lemah.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <M3Button
            variant="filled"
            onClick={() => {
              void install();
            }}
          >
            Pasang
          </M3Button>
          <M3Button variant="text" onClick={pwa.dismissInstallNudge}>
            Nanti
          </M3Button>
        </div>
      </M3Card>
    );
  }

  if (pwa.notificationNudgeVisible) {
    return (
      <M3Card
        variant="secondary-container"
        radius="lg"
        className={cn("grid gap-3", className)}
      >
        <div className="flex items-start gap-3">
          <M3Shape shape="cookie9" size={40} className="pwa-banner-mark">
            <BellRing aria-hidden="true" />
          </M3Shape>
          <div className="grid gap-1">
            <p className="m3-tm">Aktifkan notifikasi gangguan</p>
            <p className="m3-bs">
              Info jalur dan pengingat turun bisa masuk ke perangkat ini.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <M3Button
            variant="filled"
            icon={<Bell aria-hidden="true" />}
            onClick={() => {
              void pwa.requestNotificationPermission();
            }}
          >
            Aktifkan
          </M3Button>
          <M3Button variant="text" onClick={pwa.dismissNotificationNudge}>
            Nanti
          </M3Button>
        </div>
      </M3Card>
    );
  }

  return null;
}

/**
 * The complete notification state for the settings surface and the
 * onboarding permission step.
 *
 * It names the exact platform, browser and display mode, then shows the one
 * action that is possible right now. The permission request always runs from
 * this button, never from a mount effect.
 */
export function PwaNotificationCard({ className }: PwaBannerProps) {
  const pwa = usePwa();
  const [message, setMessage] = useState<string | null>(null);
  const capability = pwa.notificationCapability;

  const platformLabel =
    pwa.environment.platform === "ios"
      ? "iPhone atau iPad"
      : pwa.environment.platform === "android"
        ? "Android"
        : "Desktop";
  const browserLabel =
    pwa.environment.browser === "safari"
      ? "Safari"
      : pwa.environment.browser === "chrome"
        ? "Chrome"
        : "Browser lain";
  const displayLabel = pwa.isStandalone ? "Layar Utama" : "Tab browser";
  const environmentLine = `${platformLabel} · ${browserLabel} · ${displayLabel}`;

  const sendTest = async (): Promise<void> => {
    const sent = await pwa.sendLocalNotification({
      title: "Daily",
      body: "Notifikasi uji berhasil. Info gangguan akan muncul di sini.",
      tag: "daily-test",
      url: "/",
    });
    setMessage(
      sent
        ? "Notifikasi uji dikirim."
        : "Notifikasi belum bisa dikirim. Periksa izin di pengaturan browser.",
    );
  };

  return (
    <M3Card variant="outlined" radius="lg" className={cn("grid gap-4", className)}>
      <div className="flex items-start gap-3">
        <M3Shape shape="cookie6" size={40} className="pwa-notification-mark">
          <BellRing aria-hidden="true" />
        </M3Shape>
        <div className="grid gap-1">
          <p className="m3-tm">Notifikasi</p>
          <p className="m3-lm text-m3-on-surface-variant">{environmentLine}</p>
        </div>
      </div>

      <div className="grid gap-1">
        <p className="m3-ts">{capability.title}</p>
        <p className="m3-bs text-m3-on-surface-variant">{capability.explanation}</p>
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

      <div className="flex flex-wrap items-center gap-2">
        {capability.status === "needs-ios-install" ? (
          <M3Button variant="tonal" icon={<Smartphone aria-hidden="true" />} onClick={pwa.openInstallSheet}>
            Cara pasang di iPhone/iPad
          </M3Button>
        ) : null}
        {capability.status === "prompt" ? (
          <M3Button
            variant="filled"
            icon={<Bell aria-hidden="true" />}
            onClick={() => {
              void pwa.requestNotificationPermission();
            }}
          >
            Aktifkan notifikasi
          </M3Button>
        ) : null}
        {capability.status === "ready" ? (
          <M3Button
            variant="tonal"
            icon={<BellRing aria-hidden="true" />}
            onClick={() => {
              void sendTest();
            }}
          >
            Uji notifikasi
          </M3Button>
        ) : null}
      </div>

      {message ? (
        <p className="m3-bs text-m3-on-surface-variant" role="status">
          {message}
        </p>
      ) : null}
    </M3Card>
  );
}
