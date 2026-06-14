import type { CarAvailabilityStatus } from "./types";

export type AvailabilityEventType = "firstSeen" | "returned" | "disappeared";

export type AvailabilityStatus = "available" | "unavailable";

export interface ExistingAvailabilityState {
  isAvailable?: boolean | null;
  availableSince?: Date | null;
  lastAvailabilityChangeAt?: Date | null;
}

export interface OfferAvailabilitySource {
  isAvailable?: boolean | null;
  rawData?: unknown;
}

export interface AvailabilityUpdate {
  isAvailable: boolean;
  lastSeenAt: Date;
  availableSince: Date;
  unavailableSince: null;
  lastAvailabilityChangeAt: Date;
  eventType?: Exclude<AvailabilityEventType, "disappeared">;
}

export function getSeenAvailabilityUpdate(
  existing: ExistingAvailabilityState | undefined,
  seenAt: Date,
): AvailabilityUpdate {
  const eventType = !existing
    ? "firstSeen"
    : existing.isAvailable === false
      ? "returned"
      : undefined;

  return {
    isAvailable: true,
    lastSeenAt: seenAt,
    availableSince:
      existing && existing.isAvailable !== false && existing.availableSince
        ? existing.availableSince
        : seenAt,
    unavailableSince: null,
    lastAvailabilityChangeAt:
      eventType || !existing?.lastAvailabilityChangeAt
        ? seenAt
        : existing.lastAvailabilityChangeAt,
    eventType,
  };
}

export function shouldRecordDisappearance(
  existing: ExistingAvailabilityState,
): boolean {
  return existing.isAvailable !== false;
}

export function getCarAvailabilityStatus(
  offer: OfferAvailabilitySource,
): CarAvailabilityStatus {
  if (isRawOfferReserved(offer.rawData)) {
    return "reserved";
  }

  if (typeof offer.isAvailable === "boolean") {
    return offer.isAvailable ? "available" : "disappeared";
  }

  return isRawOfferAvailable(offer.rawData) ? "available" : "disappeared";
}

export function isRawOfferAvailable(rawData: unknown): boolean {
  if (!rawData || typeof rawData !== "object") {
    return false;
  }

  const record = rawData as {
    reservationLabelCode?: unknown;
    status?: unknown;
  };

  if (
    typeof record.reservationLabelCode === "string" &&
    record.reservationLabelCode.toLowerCase() === "available"
  ) {
    return true;
  }

  return (
    typeof record.status === "string" &&
    record.status.toLowerCase() === "published"
  );
}

export function isRawOfferReserved(rawData: unknown): boolean {
  if (!rawData || typeof rawData !== "object") {
    return false;
  }

  const record = rawData as {
    reservationLabelCode?: unknown;
  };

  return (
    typeof record.reservationLabelCode === "string" &&
    record.reservationLabelCode.toLowerCase() === "reserved"
  );
}
