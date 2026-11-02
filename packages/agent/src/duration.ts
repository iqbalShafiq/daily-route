/**
 * How long a notice is expected to matter.
 *
 * This is not a severity and it is not a lifetime table. The model reads the
 * announcement, its source and its images and chooses a horizon and the next
 * time the evidence should be checked. The monitor uses the review instant;
 * it does not close a long project because its kind is `maintenance`.
 */

import { z } from "zod";

export const durationAssessmentSchema = z.object({
  horizon: z
    .enum(["hours", "days", "weeks", "months", "unknown"])
    .describe(
      "Perkiraan lama peristiwa: jam, hari, minggu, bulan, atau belum tahu. Ini bukan jenis notice.",
    ),
  reviewAfterHours: z
    .number()
    .nullable()
    .describe(
      "Berapa jam lagi bukti harus dicek ulang. Null bila pengumuman sudah menyebut akhir yang pasti. Pilih sesuai bentuk peristiwa, bukan rumus jenis.",
    ),
  reason: z
    .string()
    .describe("Alasan singkat mengapa horizon dan waktu review itu dipilih; sebut bukti yang terbaca."),
  confidence: z.number().describe("0 sampai 1"),
});

export type DurationAssessment = z.infer<typeof durationAssessmentSchema>;

/** Keep the model-shaped boundary tidy. */
export function normalizeDuration(
  value: DurationAssessment | null | undefined,
): DurationAssessment | null {
  if (!value) return null;
  const hours =
    value.reviewAfterHours !== null && Number.isFinite(value.reviewAfterHours)
      ? Math.min(2_160, Math.max(1, Math.round(value.reviewAfterHours)))
      : null;
  const confidence = Number.isFinite(value.confidence)
    ? Math.min(1, Math.max(0, value.confidence))
    : 0;
  return {
    horizon: value.horizon,
    reviewAfterHours: hours,
    reason: value.reason.trim().slice(0, 600),
    confidence,
  };
}

/**
 * The instant the next review is due, anchored to the start when there is
 * one. A future event is checked after it starts, not before.
 */
export function reviewAtFor(
  duration: DurationAssessment | null,
  anchor: Date,
  now = new Date(),
): Date | null {
  if (!duration || duration.reviewAfterHours === null) return null;
  const base = anchor.getTime() > now.getTime() ? anchor : now;
  return new Date(base.getTime() + duration.reviewAfterHours * 3_600_000);
}
