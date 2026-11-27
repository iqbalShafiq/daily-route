import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { M3Snackbar } from "../../components/m3e/index.js";
import {
  PwaContext,
  type InstallPromptOutcome,
  type NotificationRequestResult,
  type PwaContextValue,
} from "./pwa-context.js";
import { PwaInstallSheet } from "./pwa-install-sheet.js";
import {
  HAPTICS_STORAGE_KEY,
  INSTALL_DISMISSED_STORAGE_KEY,
  NOTIFICATION_DISMISSED_STORAGE_KEY,
  buildNotificationPayload,
  detectPwaPlatform,
  notificationCapabilityOf,
  shouldShowInstallNudge,
  type DailyNotificationInput,
  type PwaEnvironment,
} from "./pwa-utils.js";

export { usePwa } from "./pwa-context.js";
export type {
  InstallPromptOutcome,
  NotificationRequestResult,
  PwaContextValue,
} from "./pwa-context.js";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type BrowserApis = {
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
};

type NavigateMessage = {
  type: "DAILY_NAVIGATE";
  url: string;
};

function detectFromWindow(): PwaEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return detectPwaPlatform({ userAgent: "" });
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const standaloneMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;

  return detectPwaPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standaloneMedia,
    navigatorStandalone: navigatorWithStandalone.standalone === true,
  });
}

function readApis(): BrowserApis {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { hasNotification: false, hasServiceWorker: false, hasPushManager: false };
  }

  return {
    hasNotification: "Notification" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
  };
}

function readPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window may refuse the write. The in-memory state still works.
  }
}

function readTimestamp(key: string): number | null {
  const raw = readStorage(key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readHaptics(): boolean {
  return readStorage(HAPTICS_STORAGE_KEY) !== "off";
}

/**
 * Read the wall clock after mount, never during render.
 *
 * The install and notification nudges compare a stored dismissal timestamp
 * with "now". The state starts at zero, so the first paint is deterministic;
 * the timeout then supplies the real clock without calling an impure function
 * in the render body.
 */
function useClientNow(): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  return now;
}

function isNavigateMessage(value: unknown): value is NavigateMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record["type"] === "DAILY_NAVIGATE" && typeof record["url"] === "string";
}

/**
 * The PWA state of one browser tab.
 *
 * The provider registers the service worker, remembers a deferred install
 * prompt, follows the notification permission and renders the two global
 * surfaces: the install sheet and the update or offline snackbar.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<PwaEnvironment>(detectFromWindow);
  const [apis, setApis] = useState<BrowserApis>(readApis);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(
    () =>
      typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
        ? true
        : navigator.onLine,
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(readPermission);
  const [installDismissedAt, setInstallDismissedAt] = useState<number | null>(() =>
    readTimestamp(INSTALL_DISMISSED_STORAGE_KEY),
  );
  const [notificationDismissedAt, setNotificationDismissedAt] = useState<number | null>(() =>
    readTimestamp(NOTIFICATION_DISMISSED_STORAGE_KEY),
  );
  const [hapticsEnabled, setHapticsEnabledState] = useState(readHaptics);

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const now = useClientNow();

  const isStandalone = environment.isStandalone;
  const isInstalled = isStandalone || installed;

  const notificationCapability = useMemo(
    () =>
      notificationCapabilityOf(environment, {
        ...apis,
        permission: notificationPermission,
      }),
    [apis, environment, notificationPermission],
  );

  const canInstallOrGuide =
    !isInstalled &&
    (canPromptInstall || environment.platform === "ios" || environment.platform === "android");

  const installNudgeVisible = shouldShowInstallNudge({
    isStandalone: isInstalled,
    dismissedAt: installDismissedAt,
    now,
    canInstallOrGuide,
  });

  const notificationNudgeVisible =
    isInstalled &&
    notificationCapability.status === "prompt" &&
    shouldShowInstallNudge({
      isStandalone: false,
      dismissedAt: notificationDismissedAt,
      now,
      canInstallOrGuide: true,
    });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setEnvironment(detectFromWindow());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanPromptInstall(true);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setCanPromptInstall(false);
      setInstalled(true);
      setInstallSheetOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;

    let cancelled = false;
    let status: PermissionStatus | null = null;
    const refresh = () => setNotificationPermission(readPermission());

    try {
      void navigator.permissions
        .query({ name: "notifications" })
        .then((result) => {
          if (cancelled) return;
          status = result;
          result.addEventListener("change", refresh);
          refresh();
        })
        .catch(() => undefined);
    } catch {
      return;
    }

    return () => {
      cancelled = true;
      status?.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    // Vite rewrites module URLs and serves source files over the dev server.
    // A worker that caches them would freeze the next edit, so the PWA shell
    // is registered only in the built application.
    if (!import.meta.env.PROD) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      const onStateChange = () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
      };
      installing.addEventListener("statechange", onStateChange);
    };

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((result) => {
        if (cancelled) return;
        registration = result;
        registrationRef.current = result;
        setApis(readApis());

        if (result.waiting && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
        result.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      registrationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (!isNavigateMessage(data)) return;

      const target = new URL(data.url, window.location.origin);
      if (target.origin !== window.location.origin) return;

      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const next = `${target.pathname}${target.search}${target.hash}`;
      if (current === next) return;
      window.location.assign(target.href);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    const event = deferredPrompt.current;
    if (!event) return "unavailable";

    deferredPrompt.current = null;
    setCanPromptInstall(false);

    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome === "accepted" ? "accepted" : "dismissed";
    } catch {
      return "dismissed";
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      window.location.reload();
      return;
    }

    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }

    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const requestNotificationPermission =
    useCallback(async (): Promise<NotificationRequestResult> => {
      if (notificationCapability.status === "needs-ios-install") return "needs-ios-install";
      if (notificationCapability.status === "unsupported" || typeof Notification === "undefined") {
        return "unsupported";
      }

      if (Notification.permission === "granted") {
        setNotificationPermission("granted");
        return "granted";
      }
      if (Notification.permission === "denied") {
        setNotificationPermission("denied");
        return "denied";
      }

      try {
        const result = await Notification.requestPermission();
        if (result === "granted" || result === "denied" || result === "default") {
          setNotificationPermission(result);
          return result;
        }
        return "unsupported";
      } catch {
        return "unsupported";
      }
    }, [notificationCapability.status]);

  const sendLocalNotification = useCallback(
    async (input: DailyNotificationInput): Promise<boolean> => {
      if (typeof navigator === "undefined") return false;
      const payload = buildNotificationPayload(input);

      try {
        if ("serviceWorker" in navigator) {
          const registration = navigator.serviceWorker.controller
            ? await navigator.serviceWorker.ready
            : await navigator.serviceWorker.getRegistration("/");
          if (registration?.active) {
            const options: NotificationOptions & { vibrate: number[] } = {
              body: payload.body,
              icon: payload.icon,
              badge: payload.badge,
              tag: payload.tag,
              data: { url: payload.url },
              vibrate: [140, 60, 140],
            };
            await registration.showNotification(payload.title, options);
            if (hapticsEnabled && typeof navigator.vibrate === "function") {
              navigator.vibrate([140, 60, 140]);
            }
            return true;
          }
        }

        if (
          environment.platform === "desktop" &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(payload.title, {
            body: payload.body,
            icon: payload.icon,
            tag: payload.tag,
          });
          if (hapticsEnabled && typeof navigator.vibrate === "function") {
            navigator.vibrate([140, 60, 140]);
          }
          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [environment.platform, hapticsEnabled],
  );

  const openInstallSheet = useCallback(() => setInstallSheetOpen(true), []);
  const closeInstallSheet = useCallback(() => setInstallSheetOpen(false), []);

  const dismissInstallNudge = useCallback(() => {
    const now = Date.now();
    setInstallDismissedAt(now);
    writeStorage(INSTALL_DISMISSED_STORAGE_KEY, String(now));
    setInstallSheetOpen(false);
  }, []);

  const dismissNotificationNudge = useCallback(() => {
    const now = Date.now();
    setNotificationDismissedAt(now);
    writeStorage(NOTIFICATION_DISMISSED_STORAGE_KEY, String(now));
  }, []);

  const setHapticsEnabled = useCallback((enabled: boolean) => {
    setHapticsEnabledState(enabled);
    writeStorage(HAPTICS_STORAGE_KEY, enabled ? "on" : "off");
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      environment,
      canPromptInstall,
      installSheetOpen,
      isStandalone,
      isInstalled,
      isOnline,
      updateAvailable,
      notificationPermission,
      notificationCapability,
      installDismissedAt,
      notificationDismissedAt,
      canInstallOrGuide,
      installNudgeVisible,
      notificationNudgeVisible,
      hapticsEnabled,
      promptInstall,
      applyUpdate,
      requestNotificationPermission,
      sendLocalNotification,
      openInstallSheet,
      closeInstallSheet,
      dismissInstallNudge,
      dismissNotificationNudge,
      setHapticsEnabled,
    }),
    [
      environment,
      canPromptInstall,
      installSheetOpen,
      isStandalone,
      isInstalled,
      isOnline,
      updateAvailable,
      notificationPermission,
      notificationCapability,
      installDismissedAt,
      notificationDismissedAt,
      canInstallOrGuide,
      installNudgeVisible,
      notificationNudgeVisible,
      hapticsEnabled,
      promptInstall,
      applyUpdate,
      requestNotificationPermission,
      sendLocalNotification,
      openInstallSheet,
      closeInstallSheet,
      dismissInstallNudge,
      dismissNotificationNudge,
      setHapticsEnabled,
    ],
  );

  return (
    <PwaContext.Provider value={value}>
      {children}
      <PwaInstallSheet />
      <M3Snackbar
        open={updateAvailable}
        message="Pembaruan Daily tersedia"
        actionLabel="Muat ulang"
        onAction={applyUpdate}
      />
      <M3Snackbar
        open={!updateAvailable && !isOnline}
        message="Sedang offline, menampilkan data tersimpan"
      />
    </PwaContext.Provider>
  );
}
