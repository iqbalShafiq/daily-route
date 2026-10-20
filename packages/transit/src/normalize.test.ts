import { describe, expect, it } from "vitest";

import { buildSearchDocument, canonicalKey, normalizeText, tokenize, trigramDice } from "./normalize.js";

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("Bundaran HI, Monas")).toBe("bundaran hi monas");
  });

  it("keeps digits", () => {
    expect(normalizeText("Stasiun T/CS 1")).toBe("stasiun t cs 1");
  });
});

describe("tokenize", () => {
  it("drops operator-only tokens", () => {
    expect(tokenize("Halte Bundaran Senayan")).toEqual(["bundaran", "senayan"]);
  });

  it("drops the city name", () => {
    expect(tokenize("Stasiun MRT Jakarta Bundaran HI")).toEqual(["bundaran", "hi"]);
  });
});

describe("canonicalKey", () => {
  it("collapses operator prefixes", () => {
    expect(canonicalKey("Halte Bundaran Senayan")).toBe(canonicalKey("Bundaran Senayan"));
  });
});

describe("trigramDice", () => {
  it("scores identical names at one", () => {
    expect(trigramDice("Bundaran HI", "Bundaran HI")).toBe(1);
  });

  it("scores unrelated names near zero", () => {
    expect(trigramDice("Bundaran HI", "Cawang")).toBeLessThan(0.2);
  });

  it("is forgiving of typos", () => {
    expect(trigramDice("Bundaran HI", "Bundarn HI")).toBeGreaterThan(0.6);
  });
});

describe("buildSearchDocument", () => {
  it("includes name, code, area and aliases", () => {
    const document = buildSearchDocument({
      name: "Bundaran HI",
      code: "NS08",
      area: "Menteng",
      aliases: ["Grand Indonesia", "Monas"],
    });
    expect(document).toContain("bundaran hi");
    expect(document).toContain("grand indonesia");
    expect(document).toContain("monas");
  });
});
