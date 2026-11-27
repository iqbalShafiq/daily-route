import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEED,
  LEGACY_THEME_STORAGE_KEY,
  SEED_IDS,
  SEED_PRESETS,
  SEED_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  applyThemeChoice,
  isSeedColor,
  isThemeMode,
  readStoredMode,
  readStoredSeed,
  resolveTheme,
  themeColorFor,
  type ThemeStorage,
} from "./theme.js";

function fakeStorage(initial: Record<string, string> = {}): ThemeStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("SEED_PRESETS", () => {
  it("defines exactly the six seeds in picker order", () => {
    expect(SEED_IDS).toEqual(["teal", "wall", "coral", "blue", "plum", "olive"]);
    expect(SEED_IDS).toHaveLength(6);
    for (const id of SEED_IDS) {
      expect(SEED_PRESETS[id].id).toBe(id);
      expect(SEED_PRESETS[id].label.length).toBeGreaterThan(0);
      expect(SEED_PRESETS[id].swatchHex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("gives every seed a distinct swatch and theme pair", () => {
    const swatches = SEED_IDS.map((id) => SEED_PRESETS[id].swatchHex);
    expect(new Set(swatches).size).toBe(6);
    for (const id of SEED_IDS) {
      expect(SEED_PRESETS[id].lightThemeColor).toMatch(/^#[0-9A-F]{6}$/);
      expect(SEED_PRESETS[id].darkThemeColor).toMatch(/^#[0-9A-F]{6}$/);
      expect(SEED_PRESETS[id].lightThemeColor).not.toBe(SEED_PRESETS[id].darkThemeColor);
    }
  });

  it("defaults to teal", () => {
    expect(DEFAULT_SEED).toBe("teal");
    expect(readStoredSeed(fakeStorage())).toBe("teal");
  });
});

describe("theme resolution", () => {
  it("follows the system only in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("recognises every mode and rejects anything else", () => {
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it("reads the current key before the legacy key", () => {
    const storage = fakeStorage({
      [THEME_MODE_STORAGE_KEY]: "dark",
      [LEGACY_THEME_STORAGE_KEY]: "light",
    });
    expect(readStoredMode(storage)).toBe("dark");
  });

  it("upgrades a legacy pinned theme", () => {
    expect(readStoredMode(fakeStorage({ [LEGACY_THEME_STORAGE_KEY]: "light" }))).toBe("light");
    expect(readStoredMode(fakeStorage({ [LEGACY_THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
  });

  it("falls back to the system for a missing or unknown value", () => {
    expect(readStoredMode(fakeStorage())).toBe("system");
    expect(readStoredMode(fakeStorage({ [THEME_MODE_STORAGE_KEY]: "sepia" }))).toBe("system");
    expect(readStoredMode(fakeStorage({ [LEGACY_THEME_STORAGE_KEY]: "sepia" }))).toBe("system");
    expect(readStoredMode(null)).toBe("system");
  });

  it("reads only a known seed", () => {
    expect(readStoredSeed(fakeStorage({ [SEED_STORAGE_KEY]: "plum" }))).toBe("plum");
    expect(readStoredSeed(fakeStorage({ [SEED_STORAGE_KEY]: "neon" }))).toBe("teal");
    expect(isSeedColor("olive")).toBe(true);
    expect(isSeedColor("neon")).toBe(false);
  });
});

describe("theme-color metadata", () => {
  it("maps every seed and theme to the surface in its preset", () => {
    for (const id of SEED_IDS) {
      expect(themeColorFor(id, "light")).toBe(SEED_PRESETS[id].lightThemeColor);
      expect(themeColorFor(id, "dark")).toBe(SEED_PRESETS[id].darkThemeColor);
    }
  });

  it("writes the pair and the browser chrome onto the root element", () => {
    const meta = { name: "theme-color", content: "" } as unknown as HTMLMetaElement;
    const written: Array<[string, string]> = [];
    const root = {
      dataset: {} as DOMStringMap,
      style: {
        setProperty: (name: string, value: string) => {
          written.push([name, value]);
        },
      },
      ownerDocument: {
        querySelector: () => meta,
        createElement: () => meta,
        head: { append: () => undefined },
      },
    } as unknown as HTMLElement;

    applyThemeChoice(root, "dark", "plum");

    expect(root.dataset["theme"]).toBe("dark");
    expect(root.dataset["seed"]).toBe("plum");
    expect(meta.content).toBe(SEED_PRESETS.plum.darkThemeColor);
    expect(written).toContainEqual(["color-scheme", "dark"]);
  });

  it("is kept in sync with the inline bootstrap in index.html", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain("daily-route-theme-mode");
    expect(html).toContain("daily-route-seed");
    expect(html).toContain('name="theme-color"');
    for (const id of SEED_IDS) {
      expect(html).toContain(`${id}: { light: "${SEED_PRESETS[id].lightThemeColor}"`);
      expect(html).toContain(`dark: "${SEED_PRESETS[id].darkThemeColor}"`);
    }
  });
});
