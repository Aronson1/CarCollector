export type AvailabilityEventType = "firstSeen" | "returned" | "disappeared";

export type AvailabilityStatus = "available" | "unavailable";

export interface ExistingAvailabilityState {
  isAvailable?: boolean | null;
  availableSince?: Date | null;
  lastAvailabilityChangeAt?: Date | null;
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
