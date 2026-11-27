/**
 * Pure rules for the cross-platform PWA surface.
 *
 * Nothing in this module reads `window`, `navigator` or `Notification`, so a
 * unit test can exercise every platform without a DOM. The provider in
 * `pwa-provider.tsx` is the only place that turns the live browser into these
 * inputs.
 */

export type PwaPlatform = "ios" | "android" | "desktop";

export type PwaBrowser = "safari" | "chrome" | "other";

export type PwaEnvironment = {
  platform: PwaPlatform;
  browser: PwaBrowser;
  isStandalone: boolean;
  /** An iPhone or iPad browser that cannot add Daily to the Home Screen itself. */
  isIosInAppOrNonSafari: boolean;
  /** Web Push is only available after an iOS rider installs Daily. */
  requiresStandaloneForPush: boolean;
  /** The browser may fire `beforeinstallprompt`. */
  supportsNativeInstallPrompt: boolean;
};

export type PwaEnvironmentInput = {
  userAgent: string;
  maxTouchPoints?: number;
  standaloneMedia?: boolean;
  navigatorStandalone?: boolean;
};

export type NotificationStatus =
  | "ready"
  | "prompt"
  | "denied"
  | "needs-ios-install"
  | "unsupported";

export type NotificationCapability = {
  status: NotificationStatus;
  /** A short heading for a settings row or a permission card. */
  title: string;
  /** One sentence that says what the rider can do next. */
  explanation: string;
  canRequest: boolean;
  requiresInstall: boolean;
};

export type NotificationApis = {
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | "unsupported";
};

export type InstallNudgeState = {
  isStandalone: boolean;
  dismissedAt: number | null;
  now: number;
  canInstallOrGuide: boolean;
};

export type DailyNotificationInput = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type DailyNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
};

/** Seven days between a dismissed install nudge and the next one. */
export const INSTALL_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const INSTALL_DISMISSED_STORAGE_KEY = "daily-route.pwa-install-dismissed-at";
export const NOTIFICATION_DISMISSED_STORAGE_KEY = "daily-route.pwa-notification-dismissed-at";
export const HAPTICS_STORAGE_KEY = "daily-route.pwa-haptics";

const IOS_IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Pinterest|LinkedIn/i;
const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/i;

function browserOf(platform: PwaPlatform, userAgent: string): PwaBrowser {
  if (platform === "ios") {
    if (/CriOS/i.test(userAgent)) return "chrome";
    if (IOS_NON_SAFARI.test(userAgent)) return "other";
    if (/Safari/i.test(userAgent) && !/Chrome|Chromium/i.test(userAgent)) return "safari";
    return "other";
  }

  if (platform === "android") {
    if (/Firefox|FxiOS/i.test(userAgent)) return "other";
    if (/Chrome|Chromium|CriOS/i.test(userAgent)) return "chrome";
    return "other";
  }

  if (/Firefox|FxiOS/i.test(userAgent)) return "other";
  if (/Edg\/|OPR\/|Chrome|Chromium|CriOS/i.test(userAgent)) return "chrome";
  if (/Safari/i.test(userAgent)) return "safari";
  return "other";
}

/**
 * Read the platform from the browser strings and the two standalone signals.
 *
 * iPadOS 13 and later report a desktop Macintosh user agent by default, so
 * `Macintosh` plus a touch screen is iOS, not a desktop. The caller passes
 * `navigator.maxTouchPoints`; a Mac with a touch screen does not exist.
 */
export function detectPwaPlatform(input: PwaEnvironmentInput): PwaEnvironment {
  const userAgent = input.userAgent;
  const isIpadDesktop = /Macintosh/i.test(userAgent) && (input.maxTouchPoints ?? 0) > 1;
  const isIos = /iPhone|iPad|iPod/i.test(userAgent) || isIpadDesktop;
  const isAndroid = !isIos && /Android/i.test(userAgent);

  const platform: PwaPlatform = isIos ? "ios" : isAndroid ? "android" : "desktop";
  const browser = browserOf(platform, userAgent);
  const isStandalone = input.standaloneMedia === true || input.navigatorStandalone === true;
  const isIosInAppOrNonSafari =
    platform === "ios" && (browser !== "safari" || IOS_IN_APP_BROWSER.test(userAgent));
  const requiresStandaloneForPush = platform === "ios" && !isStandalone;
  const supportsNativeInstallPrompt =
    !isStandalone &&
    browser === "chrome" &&
    (platform === "android" || platform === "desktop");

  return {
    platform,
    browser,
    isStandalone,
    isIosInAppOrNonSafari,
    requiresStandaloneForPush,
    supportsNativeInstallPrompt,
  };
}

const CAPABILITY_COPY: Record<NotificationStatus, { title: string; explanation: string }> = {
  ready: {
    title: "Notifikasi aktif",
    explanation: "Daily bisa mengirim info gangguan dan pengingat perjalanan di perangkat ini.",
  },
  prompt: {
    title: "Aktifkan notifikasi",
    explanation: "Izinkan Daily mengirim info gangguan dan pengingat perjalanan.",
  },
  denied: {
    title: "Notifikasi diblokir",
    explanation: "Buka pengaturan situs di browser, lalu izinkan notifikasi untuk Daily.",
  },
  "needs-ios-install": {
    title: "Pasang Daily dulu",
    explanation:
      "Di iPhone dan iPad, notifikasi baru bisa aktif setelah Daily ditambahkan ke Layar Utama dan dibuka dari ikonnya.",
  },
  unsupported: {
    title: "Notifikasi belum didukung",
    explanation:
      "Browser ini belum mendukung notifikasi untuk Daily. Buka Daily di Chrome atau Safari terbaru.",
  },
};

/**
 * Decide whether the rider can receive notifications right now.
 *
 * The iOS rule comes first on purpose. WebKit only exposes Web Push to a web
 * app that runs from the Home Screen, so a regular Safari tab must be sent to
 * the install guide before the permission prompt is shown.
 */
export function notificationCapabilityOf(
  environment: PwaEnvironment,
  apis: NotificationApis,
): NotificationCapability {
  let status: NotificationStatus;

  if (environment.platform === "ios" && !environment.isStandalone) {
    status = "needs-ios-install";
  } else if (
    !apis.hasNotification ||
    !apis.hasServiceWorker ||
    !apis.hasPushManager ||
    apis.permission === "unsupported"
  ) {
    status = "unsupported";
  } else if (apis.permission === "denied") {
    status = "denied";
  } else if (apis.permission === "granted") {
    status = "ready";
  } else {
    status = "prompt";
  }

  const copy = CAPABILITY_COPY[status];
  return {
    status,
    title: copy.title,
    explanation: copy.explanation,
    canRequest: status === "prompt",
    requiresInstall: status === "needs-ios-install",
  };
}

/** A dismissed nudge stays quiet for seven days. A future timestamp stays quiet too. */
export function shouldShowInstallNudge(state: InstallNudgeState): boolean {
  if (state.isStandalone || !state.canInstallOrGuide) return false;
  if (state.dismissedAt === null || !Number.isFinite(state.dismissedAt)) return true;
  return state.now - state.dismissedAt >= INSTALL_NUDGE_COOLDOWN_MS;
}

/**
 * Normalise a local or push notification before it reaches the service
 * worker. The icon and badge are the same files the manifest installs.
 */
export function buildNotificationPayload(
  input: DailyNotificationInput,
): DailyNotificationPayload {
  const title = input.title.trim();
  const body = input.body.trim();
  const url = input.url?.trim();
  const tag = input.tag?.trim();

  return {
    title: title || "Daily",
    body: body || "Ada pembaruan di jaringan.",
    url: url || "/",
    tag: tag || "daily-update",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
  };
}
