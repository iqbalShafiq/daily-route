#!/usr/bin/env node
/**
 * Generate the Daily PWA icon set and the favicon from one deterministic
 * vector definition.
 *
 * The mark is a Material 3 Expressive app emblem: a teal ground, a soft
 * cookie-12 primary-container shape and a dark "d" monogram whose stem
 * carries a white transit stop. Every PNG is rendered with five samples per
 * pixel so the curves stay clean at 72 px and at 512 px.
 *
 * Run from `apps/web`:
 *
 *   node scripts/generate-pwa-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = join(WEB_ROOT, "public", "icons");
const PUBLIC_DIR = join(WEB_ROOT, "public");

const TEAL = [0x00, 0x69, 0x6e];
const LIGHT = [0xa2, 0xee, 0xf1];
const DARK = [0x00, 0x39, 0x3c];
const WHITE = [0xff, 0xff, 0xff];

/**
 * The generated cookie-12 polygon from `src/styles.css`, normalised to a
 * 100 x 100 box. It is the same silhouette the interface uses for M3Shape.
 */
const COOKIE_12 = [
  [50, 0],
  [54.7, 1.8],
  [58.9, 5.3],
  [63.1, 7],
  [68.1, 6.2],
  [73.5, 6.1],
  [77.4, 9.1],
  [79.4, 14.1],
  [81.7, 18.3],
  [85.9, 20.6],
  [90.9, 22.6],
  [93.9, 26.5],
  [93.8, 31.9],
  [93, 36.9],
  [94.7, 41.1],
  [98.2, 45.3],
  [100, 50],
  [98.2, 54.7],
  [94.7, 58.9],
  [93, 63.1],
  [93.8, 68.1],
  [93.9, 73.5],
  [90.9, 77.4],
  [85.9, 79.4],
  [81.7, 81.7],
  [79.4, 85.9],
  [77.4, 90.9],
  [73.5, 93.9],
  [68.1, 93.8],
  [63.1, 93],
  [58.9, 94.7],
  [54.7, 98.2],
  [50, 100],
  [45.3, 98.2],
  [41.1, 94.7],
  [36.9, 93],
  [31.9, 93.8],
  [26.5, 93.9],
  [22.6, 90.9],
  [20.6, 85.9],
  [18.3, 81.7],
  [14.1, 79.4],
  [9.1, 77.4],
  [6.1, 73.5],
  [6.2, 68.1],
  [7, 63.1],
  [5.3, 58.9],
  [1.8, 54.7],
  [0, 50],
  [1.8, 45.3],
  [5.3, 41.1],
  [7, 36.9],
  [6.2, 31.9],
  [6.1, 26.5],
  [9.1, 22.6],
  [14.1, 20.6],
  [18.3, 18.3],
  [20.6, 14.1],
  [22.6, 9.1],
  [26.5, 6.1],
  [31.9, 6.2],
  [36.9, 7],
  [41.1, 5.3],
  [45.3, 1.8],
];

/** The variants that share the same layering with different safe-zone scales. */
const MARKS = {
  any: {
    fullBleed: false,
    emblemScale: 0.74,
    glyphScale: 0.52,
    stationDot: true,
  },
  maskable: {
    fullBleed: true,
    emblemScale: 0.66,
    glyphScale: 0.44,
    stationDot: true,
  },
  apple: {
    fullBleed: true,
    emblemScale: 0.7,
    glyphScale: 0.48,
    stationDot: true,
  },
  badge: {
    fullBleed: false,
    emblemScale: 0,
    glyphScale: 0.82,
    stationDot: false,
  },
};

function insidePolygon(px, py, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index];
    const before = points[previous];
    const intersects =
      current[1] > py !== before[1] > py &&
      px <
        ((before[0] - current[0]) * (py - current[1])) / (before[1] - current[1]) + current[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function insideSquircle(x, y, half, exponent) {
  return (
    Math.pow(Math.abs((x - 50) / half), exponent) +
      Math.pow(Math.abs((y - 50) / half), exponent) <=
    1
  );
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.min(Math.max(x, left + radius), right - radius);
  const nearestY = Math.min(Math.max(y, top + radius), bottom - radius);
  if (x >= left + radius && x <= right - radius) {
    return y >= top && y <= bottom;
  }
  if (y >= top + radius && y <= bottom - radius) {
    return x >= left && x <= right;
  }
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

function localPoint(x, y, scale) {
  return [50 + (x - 50) / scale, 50 + (y - 50) / scale];
}

function insideEmblem(x, y, scale) {
  const [ex, ey] = localPoint(x, y, scale);
  return insidePolygon(ex, ey, COOKIE_12);
}

function insideGlyph(x, y, scale) {
  const [gx, gy] = localPoint(x, y, scale);
  const bowl = Math.hypot(gx - 48.5, gy - 56);
  const insideBowl = bowl <= 21 && bowl >= 9.5;
  const insideStem = insideRoundedRect(gx, gy, 58.5, 18, 72.5, 84, 6);
  return insideBowl || insideStem;
}

function insideStationDot(x, y, scale) {
  const [gx, gy] = localPoint(x, y, scale);
  return Math.hypot(gx - 65.5, gy - 27) <= 4;
}

function colourAt(x, y, mark) {
  if (mark === MARKS.badge) {
    return insideGlyph(x, y, mark.glyphScale) ? WHITE : null;
  }

  if (!mark.fullBleed && !insideSquircle(x, y, 48, 3.4)) return null;

  let colour = TEAL;
  if (insideEmblem(x, y, mark.emblemScale)) colour = LIGHT;
  if (insideGlyph(x, y, mark.glyphScale)) colour = DARK;
  if (mark.stationDot && insideStationDot(x, y, mark.glyphScale)) colour = WHITE;
  return colour;
}

function renderIcon(size, mark) {
  const samples = 5;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = ((x + (sx + 0.5) / samples) / size) * 100;
          const v = ((y + (sy + 0.5) / samples) / size) * 100;
          const colour = colourAt(u, v, mark);
          if (colour === null) continue;
          red += colour[0];
          green += colour[1];
          blue += colour[2];
          alpha += 255;
        }
      }

      const total = samples * samples;
      const offset = (y * size + x) * 4;
      if (alpha === 0) {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 0;
        continue;
      }
      const covered = alpha / 255;
      pixels[offset] = Math.round(red / covered);
      pixels[offset + 1] = Math.round(green / covered);
      pixels[offset + 2] = Math.round(blue / covered);
      pixels[offset + 3] = Math.round(alpha / total);
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function pngOf(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const target = y * (size * 4 + 1);
    raw[target] = 0;
    pixels.copy(raw, target + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(fileName, size, mark) {
  const buffer = pngOf(size, renderIcon(size, mark));
  writeFileSync(join(ICONS_DIR, fileName), buffer);

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== size || height !== size) {
    throw new Error(`${fileName} rendered ${width}x${height}, expected ${size}x${size}`);
  }
  console.log(`${fileName}: ${width}x${height}, ${buffer.length} bytes`);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Daily">
  <rect width="64" height="64" rx="15" fill="#00696E"/>
  <rect x="8" y="8" width="48" height="48" rx="16" fill="#A2EEF1"/>
  <circle cx="30.5" cy="36" r="10.5" fill="none" stroke="#00393C" stroke-width="6.5"/>
  <rect x="40" y="16" width="7" height="33" rx="3.5" fill="#00393C"/>
  <circle cx="43.5" cy="21.5" r="2.6" fill="#FFFFFF"/>
</svg>
`;

mkdirSync(ICONS_DIR, { recursive: true });
writePng("icon-192.png", 192, MARKS.any);
writePng("icon-512.png", 512, MARKS.any);
writePng("icon-maskable-192.png", 192, MARKS.maskable);
writePng("icon-maskable-512.png", 512, MARKS.maskable);
writePng("apple-touch-icon-180.png", 180, MARKS.apple);
writePng("badge-72.png", 72, MARKS.badge);
writeFileSync(join(PUBLIC_DIR, "favicon.svg"), FAVICON);
console.log("favicon.svg: written");
