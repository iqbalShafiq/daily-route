import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PwaInstallBanner,
  PwaInstallSheet,
  PwaNotificationCard,
  PwaProvider,
  installGuideOf,
} from "./index.js";
import {
  INSTALL_NUDGE_COOLDOWN_MS,
  buildNotificationPayload,
  detectPwaPlatform,
  notificationCapabilityOf,
  shouldShowInstallNudge,
  type NotificationApis,
} from "./pwa-utils.js";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IOS_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.123";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const ALL_APIS: NotificationApis = {
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  permission: "default",
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe("detectPwaPlatform", () => {
  it("recognises an iPhone Safari tab and requires an install before push", () => {
    const environment = detectPwaPlatform({ userAgent: IOS_SAFARI });

    expect(environment.platform).toBe("ios");
    expect(environment.browser).toBe("safari");
    expect(environment.isStandalone).toBe(false);
    expect(environment.isIosInAppOrNonSafari).toBe(false);
    expect(environment.requiresStandaloneForPush).toBe(true);
    expect(environment.supportsNativeInstallPrompt).toBe(false);
  });

  it("recognises iPadOS even when it reports a desktop Macintosh user agent", () => {
    const withoutTouch = detectPwaPlatform({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 });
    const withTouch = detectPwaPlatform({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 });

    expect(withoutTouch.platform).toBe("desktop");
    expect(withTouch.platform).toBe("ios");
    expect(withTouch.browser).toBe("safari");
    expect(withTouch.requiresStandaloneForPush).toBe(true);
  });

  it("flags iOS Chrome and an in-app browser as unable to install by themselves", () => {
    const chrome = detectPwaPlatform({ userAgent: IOS_CHROME });
    const instagram = detectPwaPlatform({ userAgent: IOS_INSTAGRAM });

    expect(chrome.platform).toBe("ios");
    expect(chrome.browser).toBe("chrome");
    expect(chrome.isIosInAppOrNonSafari).toBe(true);
    expect(chrome.supportsNativeInstallPrompt).toBe(false);
    expect(instagram.platform).toBe("ios");
    expect(instagram.browser).toBe("other");
    expect(instagram.isIosInAppOrNonSafari).toBe(true);
  });

  it("accepts either standalone signal on iOS", () => {
    const navigatorStandalone = detectPwaPlatform({
      userAgent: IOS_SAFARI,
      navigatorStandalone: true,
    });
    const mediaStandalone = detectPwaPlatform({
      userAgent: IOS_SAFARI,
      standaloneMedia: true,
    });

    expect(navigatorStandalone.isStandalone).toBe(true);
    expect(navigatorStandalone.requiresStandaloneForPush).toBe(false);
    expect(mediaStandalone.isStandalone).toBe(true);
    expect(mediaStandalone.requiresStandaloneForPush).toBe(false);
  });

  it("selects the iOS guide for an iPhone Safari tab and the browser guide otherwise", () => {
    const ios = detectPwaPlatform({ userAgent: IOS_SAFARI });
    const android = detectPwaPlatform({ userAgent: ANDROID_CHROME });

    expect(installGuideOf(ios, false)).toBe("ios");
    expect(installGuideOf(ios, true)).toBe("installed");
    expect(installGuideOf(android, false)).toBe("browser");
  });

  it("recognises Android Chrome as a native install prompt platform", () => {
    const environment = detectPwaPlatform({ userAgent: ANDROID_CHROME });

    expect(environment.platform).toBe("android");
    expect(environment.browser).toBe("chrome");
    expect(environment.supportsNativeInstallPrompt).toBe(true);
    expect(environment.requiresStandaloneForPush).toBe(false);
  });

  it("keeps desktop Chrome installable and desktop Safari on the guide route", () => {
    const chrome = detectPwaPlatform({ userAgent: DESKTOP_CHROME });
    const safari = detectPwaPlatform({ userAgent: DESKTOP_SAFARI, maxTouchPoints: 0 });

    expect(chrome.platform).toBe("desktop");
    expect(chrome.browser).toBe("chrome");
    expect(chrome.supportsNativeInstallPrompt).toBe(true);
    expect(safari.platform).toBe("desktop");
    expect(safari.browser).toBe("safari");
    expect(safari.supportsNativeInstallPrompt).toBe(false);
  });
});

describe("notificationCapabilityOf", () => {
  it("sends an iOS Safari tab to the Home Screen before asking for permission", () => {
    const environment = detectPwaPlatform({ userAgent: IOS_SAFARI });
    const capability = notificationCapabilityOf(environment, {
      ...ALL_APIS,
      permission: "granted",
    });

    expect(capability.status).toBe("needs-ios-install");
    expect(capability.canRequest).toBe(false);
    expect(capability.requiresInstall).toBe(true);
    expect(capability.explanation).toContain("Layar Utama");
  });

  it("offers the prompt to an installed iOS web app", () => {
    const environment = detectPwaPlatform({ userAgent: IOS_SAFARI, standaloneMedia: true });
    const prompt = notificationCapabilityOf(environment, ALL_APIS);
    const ready = notificationCapabilityOf(environment, {
      ...ALL_APIS,
      permission: "granted",
    });

    expect(prompt.status).toBe("prompt");
    expect(prompt.canRequest).toBe(true);
    expect(ready.status).toBe("ready");
  });

  it("lets Android Chrome ask in a normal browser tab", () => {
    const environment = detectPwaPlatform({ userAgent: ANDROID_CHROME });
    const capability = notificationCapabilityOf(environment, ALL_APIS);

    expect(capability.status).toBe("prompt");
    expect(capability.canRequest).toBe(true);
    expect(capability.requiresInstall).toBe(false);
  });

  it("reports a denied permission without offering the prompt again", () => {
    const environment = detectPwaPlatform({ userAgent: ANDROID_CHROME });
    const capability = notificationCapabilityOf(environment, {
      ...ALL_APIS,
      permission: "denied",
    });

    expect(capability.status).toBe("denied");
    expect(capability.canRequest).toBe(false);
  });

  it("reports browsers without the required APIs as unsupported", () => {
    const environment = detectPwaPlatform({ userAgent: DESKTOP_SAFARI });

    expect(
      notificationCapabilityOf(environment, {
        ...ALL_APIS,
        hasServiceWorker: false,
      }).status,
    ).toBe("unsupported");
    expect(
      notificationCapabilityOf(environment, {
        ...ALL_APIS,
        hasPushManager: false,
      }).status,
    ).toBe("unsupported");
    expect(
      notificationCapabilityOf(environment, {
        ...ALL_APIS,
        permission: "unsupported",
      }).status,
    ).toBe("unsupported");
  });

  it("reports a granted desktop browser as ready", () => {
    const environment = detectPwaPlatform({ userAgent: DESKTOP_CHROME });
    const capability = notificationCapabilityOf(environment, {
      ...ALL_APIS,
      permission: "granted",
    });

    expect(capability.status).toBe("ready");
    expect(capability.title).toBe("Notifikasi aktif");
  });
});

describe("shouldShowInstallNudge", () => {
  const now = 1_800_000_000_000;

  it("shows the nudge until the rider dismisses it", () => {
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: null,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(true);
  });

  it("keeps the nudge quiet for seven days after a dismissal", () => {
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: now - DAY_MS,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: now - INSTALL_NUDGE_COOLDOWN_MS + DAY_MS,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: now - INSTALL_NUDGE_COOLDOWN_MS,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(true);
  });

  it("stays quiet when Daily is installed or no install path exists", () => {
    expect(
      shouldShowInstallNudge({
        isStandalone: true,
        dismissedAt: null,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: null,
        now,
        canInstallOrGuide: false,
      }),
    ).toBe(false);
  });

  it("treats a future dismissal timestamp as still dismissed", () => {
    expect(
      shouldShowInstallNudge({
        isStandalone: false,
        dismissedAt: now + DAY_MS,
        now,
        canInstallOrGuide: true,
      }),
    ).toBe(false);
  });
});

describe("buildNotificationPayload", () => {
  it("trims the text and fills the default icon, badge, tag and url", () => {
    const payload = buildNotificationPayload({ title: "  Daily  ", body: "  Info jalur  " });

    expect(payload).toEqual({
      title: "Daily",
      body: "Info jalur",
      url: "/",
      tag: "daily-update",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
    });
  });

  it("keeps an explicit url and tag", () => {
    const payload = buildNotificationPayload({
      title: "Gangguan",
      body: "Koridor 9 dialihkan.",
      url: "/?tab=lines",
      tag: "corridor-9",
    });

    expect(payload.url).toBe("/?tab=lines");
    expect(payload.tag).toBe("corridor-9");
  });

  it("falls back to a readable title and body when the input is blank", () => {
    const payload = buildNotificationPayload({ title: "   ", body: "   " });

    expect(payload.title).toBe("Daily");
    expect(payload.body.length).toBeGreaterThan(0);
  });
});

describe("PWA surfaces", () => {
  it("renders the provider, the banners and an open install sheet on the server", () => {
    const html = renderToStaticMarkup(
      createElement(
        PwaProvider,
        null,
        createElement(PwaInstallBanner),
        createElement(PwaNotificationCard),
        createElement(PwaInstallSheet, { open: true }),
      ),
    );

    expect(html).toContain("Pasang Daily di layar utama");
    expect(html).toContain("Notifikasi");
    expect(html).toContain("Desktop · Browser lain · Tab browser");
    expect(html).toContain("Notifikasi belum didukung");
    expect(html).toContain("Buka menu browser");
    expect(html).not.toContain("Sedang offline");
  });

  it("renders the provider without a sheet when the install state is closed", () => {
    const html = renderToStaticMarkup(
      createElement(PwaProvider, null, createElement(PwaInstallBanner)),
    );

    expect(html).not.toContain('role="dialog"');
  });

  it("renders the iOS Share guide and the installed confirmation", () => {
    const ios = renderToStaticMarkup(
      createElement(
        PwaProvider,
        null,
        createElement(PwaInstallSheet, { open: true, guide: "ios" }),
      ),
    );
    const installed = renderToStaticMarkup(
      createElement(
        PwaProvider,
        null,
        createElement(PwaInstallSheet, { open: true, guide: "installed" }),
      ),
    );

    expect(ios).toContain("Pasang Daily di iPhone");
    expect(ios).toContain("Ketuk Bagikan");
    expect(ios).toContain("Tambahkan ke Layar Utama");
    expect(ios).toContain("Ketuk Tambah dan buka Daily");
    expect(installed).toContain("Daily sudah terpasang");
  });
});
