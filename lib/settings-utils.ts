import type { DealPushThresholds } from "./types.ts";

export function normalizeDealPushThresholds(
  thresholds: Partial<DealPushThresholds>,
  fallback: number,
): DealPushThresholds {
  const defaultThreshold = clampInteger(fallback, 60, 1, 100);

  return {
    release: clampInteger(thresholds.release, defaultThreshold, 1, 100),
    sale: clampInteger(thresholds.sale, defaultThreshold, 1, 100),
    newRelease: clampInteger(thresholds.newRelease, defaultThreshold, 1, 100),
  };
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), min), max);
}
