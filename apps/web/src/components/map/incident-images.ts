import type { Map as MapLibreMap } from "maplibre-gl";

import { INCIDENT_MARKS, type IncidentMark } from "../../lib/incident-mark.js";

/**
 * Lucide marks, drawn for MapLibre.
 *
 * The paths are the published Lucide 1.60 geometry (ISC). MapLibre cannot
 * paint a React icon, so each mark is baked onto a surface plate in the
 * danger colour. `currentColor` would stay black inside an image.
 */

const GLYPH: Record<IncidentMark, string> = {
  crash:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  closure: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
  diversion:
    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  delay: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flood:
    '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"/>',
  fire: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  maintenance:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  weather:
    '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  crowd:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  strike:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  unknown:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
};

/** The outline MapLibre scales around a notice. Same plate as the icon. */
export const INCIDENT_PULSE_IMAGE = "incident-pulse";

/**
 * A stroke of the notice plate, with no fill.
 *
 * The icon covers it while the scale is 1. Growing the image lets the
 * same rounded square travel outward. The colour is the resolved danger
 * token, baked again when the style reloads.
 */
export function installIncidentPulseImage(map: MapLibreMap, danger: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(2, 2);
  context.beginPath();
  context.roundRect(1, 1, 30, 30, 8);
  context.lineWidth = 1.25;
  context.strokeStyle = danger;
  context.stroke();
  if (map.hasImage(INCIDENT_PULSE_IMAGE)) map.removeImage(INCIDENT_PULSE_IMAGE);
  map.addImage(INCIDENT_PULSE_IMAGE, context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
}

export function installIncidentImages(
  map: MapLibreMap,
  colors: { danger: string; surface: string; line: string },
): void {
  for (const mark of INCIDENT_MARKS) {
    const image = new Image();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${colors.danger}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[mark]}</svg>`;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(2, 2);
      context.beginPath();
      context.roundRect(1, 1, 30, 30, 8);
      context.fillStyle = colors.surface;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = colors.line;
      context.stroke();
      context.drawImage(image, 5, 5, 22, 22);
      const id = `incident-${mark}`;
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}
