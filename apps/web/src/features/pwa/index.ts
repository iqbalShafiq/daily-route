/**
 * The cross-platform PWA surface.
 *
 * The pure rules live in `pwa-utils`, the live browser state in
 * `pwa-provider`, and the visible surfaces in the sheet and the banners.
 */

export {
  PwaProvider,
  usePwa,
  type InstallPromptOutcome,
  type NotificationRequestResult,
  type PwaContextValue,
} from "./pwa-provider.js";
export {
  PwaInstallSheet,
  installGuideOf,
  type PwaInstallGuide,
  type PwaInstallSheetProps,
} from "./pwa-install-sheet.js";
export { PwaInstallBanner, PwaNotificationCard, type PwaBannerProps } from "./pwa-banner.js";
export {
  HAPTICS_STORAGE_KEY,
  INSTALL_DISMISSED_STORAGE_KEY,
  INSTALL_NUDGE_COOLDOWN_MS,
  NOTIFICATION_DISMISSED_STORAGE_KEY,
  buildNotificationPayload,
  detectPwaPlatform,
  notificationCapabilityOf,
  shouldShowInstallNudge,
  type DailyNotificationInput,
  type DailyNotificationPayload,
  type InstallNudgeState,
  type NotificationApis,
  type NotificationCapability,
  type NotificationStatus,
  type PwaBrowser,
  type PwaEnvironment,
  type PwaEnvironmentInput,
  type PwaPlatform,
} from "./pwa-utils.js";
