/**
 * Text normalisation for Indonesian transit names.
 *
 * The same physical place is called "Halte Bundaran Senayan" by one operator,
 * "Stasiun Bundaran Senayan" by another and "Bundaran Senayan" by a rider.
 * Matching has to survive those prefixes, punctuation, and the abbreviations
 * riders actually type.
 */

/**
 * Tokens that carry no place identity. They are dropped before matching so
 * "Halte Bundaran HI" and "Bundaran HI" collapse to the same key.
 */
const IDENTITY_NOISE_TOKENS = new Set([
  "halte",
  "hal",
  "stasiun",
  "sta",
  "st",
  "terminal",
  "bunder",
  "berhenti",
  "berhentian",
  "transjakarta",
  "tj",
  "mrt",
  "lrt",
  "lrtj",
  "krl",
  "kcommuter",
  "pt",
  "perum",
  "perumda",
  "koperasi",
  "jakarta",
  "dki",
]);

/** Common spellings riders use for the same word. */
const SPELLING_ALIASES: ReadonlyMap<string, string> = new Map([
  ["bs", "bundaransenayan"],
  ["bunderan", "bundaran"],
  ["bundaran", "bundaran"],
  ["gim", "grandindonesia"],
  ["grandindonesia", "grandindonesia"],
  ["monas", "bundaranhi"],
  ["monumen", "bundaranhi"],
  ["kbsd", "kebayoranlama"],
  ["jl", "jalan"],
  ["tj", "transjakarta"],
  ["halte", "halte"],
]);

/** Diacritic folding table — Indonesian uses few, but names do carry them. */
const DIACRITIC_FOLD: ReadonlyMap<string, string> = new Map([
  ["á", "a"],
  ["à", "a"],
  ["â", "a"],
  ["ä", "a"],
  ["ã", "a"],
  ["å", "a"],
  ["é", "e"],
  ["è", "e"],
  ["ê", "e"],
  ["ë", "e"],
  ["í", "i"],
  ["ì", "i"],
  ["î", "i"],
  ["ï", "i"],
  ["ó", "o"],
  ["ò", "o"],
  ["ô", "o"],
  ["ö", "o"],
  ["õ", "o"],
  ["ú", "u"],
  ["ù", "u"],
  ["û", "u"],
  ["ü", "u"],
  ["ñ", "n"],
  ["ç", "c"],
]);

/**
 * Lowercase, fold diacritics, drop punctuation, collapse whitespace.
 *
 * Digits are kept: several Jakarta stations are known by their number
 * ("Stasiun T/CS 1", "Stasiun Gambir 1").
 */
export function normalizeText(input: string): string {
  const folded = [...input.toLowerCase()].map((char) => DIACRITIC_FOLD.get(char) ?? char).join("");
  return folded
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a normalised string into comparable tokens.
 *
 * Tokens that only describe the operator are dropped; everything else is kept
 * so that "CS 1" survives as two tokens.
 */
export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length > 0 && !IDENTITY_NOISE_TOKENS.has(token));
}

/**
 * The canonical comparison key for a place name.
 *
 * Two names that a rider would consider "the same stop" share a key, which is
 * what the trigram and lexical matchers compare.
 */
export function canonicalKey(input: string): string {
  return tokenize(input)
    .map((token) => SPELLING_ALIASES.get(token) ?? token)
    .join(" ");
}

/**
 * The searchable document for a station.
 *
 * It carries the display name, the canonical key, every alias and the
 * surrounding area, so both lexical and embedding lookups see the same
 * material.
 */
export function buildSearchDocument(input: {
  name: string;
  code?: string | null;
  aliases?: readonly string[];
  area?: string | null;
  description?: string | null;
}): string {
  const parts = [
    input.name,
    input.code ?? null,
    input.area ?? null,
    input.description ?? null,
    ...(input.aliases ?? []),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  const unique = [...new Set(parts.map((part) => part.trim()))];
  const normalised = unique.map((part) => normalizeText(part)).filter((part) => part.length > 0);
  return [...new Set([...normalised, ...unique.map((part) => part.toLowerCase())])].join(" · ");
}

/**
 * Overlap score between two token sets, in `[0, 1]`.
 *
 * The Dice coefficient over character trigrams of the joined tokens: it is
 * robust to the small typos riders make and to the word order differences that
 * appear between "Bundaran HI" and "HI Bundaran".
 */
export function trigramDice(a: string, b: string): number {
  const gramsA = trigrams(canonicalKey(a));
  const gramsB = trigrams(canonicalKey(b));
  if (gramsA.size === 0 && gramsB.size === 0) return a.trim() === b.trim() ? 1 : 0;
  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let shared = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) shared += 1;
  }
  return (2 * shared) / (gramsA.size + gramsB.size);
}

/** The set of character trigrams of a string. Short strings yield themselves. */
export function trigrams(value: string): Set<string> {
  const key = canonicalKey(value).replace(/\s+/g, "");
  if (key.length === 0) return new Set();
  if (key.length < 3) return new Set([key]);
  const grams = new Set<string>();
  for (let index = 0; index <= key.length - 3; index += 1) {
    grams.add(key.slice(index, index + 3));
  }
  return grams;
}
