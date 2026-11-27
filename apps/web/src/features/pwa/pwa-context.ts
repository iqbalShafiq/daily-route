import { createContext, useContext } from "react";

import type { DailyNotificationInput, NotificationCapability, PwaEnvironment } from "./pwa-utils.js";

/** The result of the browser's install prompt. */
export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

/** The result of asking for the notification permission. */
export type NotificationRequestResult =
  | NotificationPermission
  | "unsupported"
  | "needs-ios-install";

export type PwaContextValue = {
  environment: PwaEnvironment;
  canPromptInstall: boolean;
  installSheetOpen: boolean;
  isStandalone: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  notificationCapability: NotificationCapability;
  installDismissedAt: number | null;
  notificationDismissedAt: number | null;
  canInstallOrGuide: boolean;
  installNudgeVisible: boolean;
  notificationNudgeVisible: boolean;
  hapticsEnabled: boolean;
  promptInstall: () => Promise<InstallPromptOutcome>;
  applyUpdate: () => void;
  requestNotificationPermission: () => Promise<NotificationRequestResult>;
  sendLocalNotification: (input: DailyNotificationInput) => Promise<boolean>;
  openInstallSheet: () => void;
  closeInstallSheet: () => void;
  dismissInstallNudge: () => void;
  dismissNotificationNudge: () => void;
  setHapticsEnabled: (enabled: boolean) => void;
};

export const PwaContext = createContext<PwaContextValue | null>(null);

/** The one way a component reads the PWA state. */
export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (value === null) {
    throw new Error("usePwa must be used inside <PwaProvider>");
  }
  return value;
}
