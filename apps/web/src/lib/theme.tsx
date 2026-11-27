import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import palette from "./m3e-palette.json";

/**
 * The theme and the seed.
 *
 * The interface follows the system preference until the reader chooses
 * otherwise. The choice is stored, and applied as `data-theme` and
 * `data-seed` on the root element, which is what the CSS custom properties
 * key off. `<meta name="theme-color">` follows the same pair, so the
 * browser chrome is the same surface as the page.
 *
 * The theme is a context rather than a hook with local state: the header
 * chooses it, the map follows it, and the account sheet previews the six
 * seeds. Those are different parts of the tree.
 */

/** What the reader chose: follow the system, or pin one theme. */
export type ThemeMode = "system" | "light" | "dark";

/** What the document actually renders. */
export type ResolvedTheme = "light" | "dark";

/** @deprecated Use `ResolvedTheme`; kept for callers written before the seed work. */
export type Theme = ResolvedTheme;

/** The six seeds of the M3 Expressive palette. */
export type SeedColor = "teal" | "wall" | "coral" | "blue" | "plum" | "olive";

export type SeedPreset = {
  id: SeedColor;
  /** The name a reader sees in the seed picker. */
  label: string;
  /** The seed itself, for the swatch. */
  swatchHex: string;
  /** The page surface in the light theme, used for the browser chrome. */
  lightThemeColor: string;
  /** The page surface in the dark theme, used for the browser chrome. */
  darkThemeColor: string;
};

export const THEME_MODE_STORAGE_KEY = "daily-route-theme-mode";
export const LEGACY_THEME_STORAGE_KEY = "daily-route-theme";
export const SEED_STORAGE_KEY = "daily-route-seed";

export const DEFAULT_SEED: SeedColor = "teal";

/**
 * The six seeds, in the order the picker shows them.
 *
 * `swatchHex` is the seed at tone 40; `lightThemeColor` and
 * `darkThemeColor` are the tone-98 and tone-6 surfaces that the same seed
 * produces. The browser chrome uses the surface, not the primary, so the
 * status bar blends into the page instead of becoming a bright band.
 */
export const SEED_PRESETS = {
  teal: { id: "teal", label: "Teal", ...palette.seeds.teal },
  wall: { id: "wall", label: "Wall", ...palette.seeds.wall },
  coral: { id: "coral", label: "Coral", ...palette.seeds.coral },
  blue: { id: "blue", label: "Blue", ...palette.seeds.blue },
  plum: { id: "plum", label: "Plum", ...palette.seeds.plum },
  olive: { id: "olive", label: "Olive", ...palette.seeds.olive },
} satisfies Record<SeedColor, SeedPreset>;

/** The seed ids in picker order. */
export const SEED_IDS = ["teal", "wall", "coral", "blue", "plum", "olive"] as const;

/** The storage surface the preference reads and writes. */
export type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function isSeedColor(value: string | null): value is SeedColor {
  return (
    value === "teal" ||
    value === "wall" ||
    value === "coral" ||
    value === "blue" ||
    value === "plum" ||
    value === "olive"
  );
}

function browserStorage(): ThemeStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // A browser with storage disabled still gets a working theme for this
    // visit; the choice is a preference, not a requirement.
    return null;
  }
}

/**
 * Read the stored mode.
 *
 * `daily-route-theme-mode` is the current key. A build that predates the
 * seed work wrote only `daily-route-theme`, so that key is still read as a
 * pinned theme and is upgraded on the next write.
 */
export function readStoredMode(storage: ThemeStorage | null | undefined): ThemeMode {
  if (!storage) return "system";
  try {
    const stored = storage.getItem(THEME_MODE_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
    const legacy = storage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    return "system";
  }
  return "system";
}

export function readStoredSeed(storage: ThemeStorage | null | undefined): SeedColor {
  if (!storage) return DEFAULT_SEED;
  try {
    const stored = storage.getItem(SEED_STORAGE_KEY);
    return isSeedColor(stored) ? stored : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

/** Resolve a mode against the system preference. */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/** The browser-chrome colour for a seed and a resolved theme. */
export function themeColorFor(seed: SeedColor, theme: ResolvedTheme): string {
  const preset = SEED_PRESETS[seed];
  return theme === "dark" ? preset.darkThemeColor : preset.lightThemeColor;
}

/**
 * Write the pair to the root element and to the browser chrome.
 *
 * The attribute is set before React repaints, so a child that reads the
 * tokens in the same commit (the map) sees the new theme rather than the
 * old one.
 */
export function applyThemeChoice(root: HTMLElement, theme: ResolvedTheme, seed: SeedColor): void {
  root.dataset["theme"] = theme;
  root.dataset["seed"] = seed;
  root.style.setProperty("color-scheme", theme);

  const document = root.ownerDocument;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = themeColorFor(seed, theme);
}

/** The system preference right now. */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Read the mode and the seed before the first paint.
 *
 * It is inlined in `index.html` so the page never flashes the wrong theme.
 * Kept exported as well so the contract has one readable copy beside the
 * provider it mirrors.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var mode = localStorage.getItem("${THEME_MODE_STORAGE_KEY}");
    if (mode !== "system" && mode !== "light" && mode !== "dark") {
      var legacy = localStorage.getItem("${LEGACY_THEME_STORAGE_KEY}");
      mode = legacy === "light" || legacy === "dark" ? legacy : "system";
    }
    var seed = localStorage.getItem("${SEED_STORAGE_KEY}");
    var colors = ${JSON.stringify(
      Object.fromEntries(
        SEED_IDS.map((id) => {
          const preset = SEED_PRESETS[id];
          return [id, { light: preset.lightThemeColor, dark: preset.darkThemeColor }];
        }),
      ),
    )};
    if (!colors[seed]) seed = "${DEFAULT_SEED}";
    var theme =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.seed = seed;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", colors[seed][theme]);
  } catch (error) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.seed = "${DEFAULT_SEED}";
  }
})();
`;

type ThemeContextValue = {
  /** The theme currently rendered. */
  theme: ResolvedTheme;
  /** What the reader chose; `system` follows the device. */
  mode: ThemeMode;
  /** The active seed. */
  seed: SeedColor;
  setMode: (mode: ThemeMode) => void;
  setSeed: (seed: SeedColor) => void;
  /** Flip the rendered theme and pin the result. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode(browserStorage()));
  const [seed, setSeed] = useState<SeedColor>(() => readStoredSeed(browserStorage()));
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (): void => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [mode]);

  const theme = resolveTheme(mode, systemDark);

  useEffect(() => {
    if (typeof document === "undefined") return;
    applyThemeChoice(document.documentElement, theme, seed);

    const storage = browserStorage();
    if (!storage) return;
    try {
      storage.setItem(THEME_MODE_STORAGE_KEY, mode);
      storage.setItem(SEED_STORAGE_KEY, seed);
      if (mode === "system") {
        // The legacy key cannot express "follow the system". Removing it lets
        // an older build fall back to the device preference too.
        storage.removeItem(LEGACY_THEME_STORAGE_KEY);
      } else {
        storage.setItem(LEGACY_THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Storage may be full or blocked; the current visit still renders.
    }
  }, [mode, seed, theme]);

  const toggle = useCallback(() => {
    setMode(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, seed, setMode, setSeed, toggle }),
    [theme, mode, seed, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The current theme, the seed and the setters that change them. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return context;
}
