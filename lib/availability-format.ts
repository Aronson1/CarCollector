import type { CarOfferView } from "./types";

export function formatAvailabilitySummary(
  car: CarOfferView,
  now = new Date(),
): string {
  const status =
    car.availabilityStatus || (car.isAvailable ? "available" : "disappeared");

  if (status === "available") {
    const latestEvent = car.availabilityHistory.at(-1);

    if (latestEvent?.eventType === "returned") {
      return `wróciła ${formatElapsedAgo(latestEvent.eventAt, now)}`;
    }

    const firstSeenAt =
      latestEvent?.eventType === "firstSeen" ? latestEvent.eventAt : undefined;
    const availableSince = car.availableSince || firstSeenAt;

    return availableSince
      ? `dostępna od ${formatElapsedDuration(availableSince, now)}`
      : "dostępna";
  }

  if (status === "reserved") {
    return "zarezerwowana";
  }

  return car.unavailableSince
    ? `zniknęła ${formatElapsedAgo(car.unavailableSince, now)}`
    : "zniknęła";
}

export function formatElapsedDuration(value: string, now = new Date()): string {
  const days = getElapsedCalendarDays(value, now);

  if (days === undefined) return "-";
  if (days <= 0) return "dziś";
  if (days === 1) return "1 dnia";
  return `${days} dni`;
}

export function formatElapsedAgo(value: string, now = new Date()): string {
  const days = getElapsedCalendarDays(value, now);

  if (days === undefined) return "-";
  if (days <= 0) return "dzisiaj";
  if (days === 1) return "1 dzień temu";
  return `${days} dni temu`;
}

function getElapsedCalendarDays(
  value: string,
  now = new Date(),
): number | undefined {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const start = startOfLocalDay(date);
  const end = startOfLocalDay(now);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
