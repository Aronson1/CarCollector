import assert from "node:assert/strict";
import test from "node:test";
import {
  getCarAvailabilityStatus,
  getSeenAvailabilityUpdate,
  shouldRecordDisappearance,
} from "../lib/availability.ts";
import {
  formatElapsedAgo,
  formatElapsedDuration,
  formatAvailabilitySummary,
} from "../lib/availability-format.ts";
import type { CarOfferView } from "../lib/types.ts";

test("marks a new seen offer as first seen", () => {
  const seenAt = new Date("2026-06-13T08:00:00.000Z");
  const update = getSeenAvailabilityUpdate(undefined, seenAt);

  assert.equal(update.isAvailable, true);
  assert.equal(update.eventType, "firstSeen");
  assert.equal(update.availableSince, seenAt);
  assert.equal(update.lastAvailabilityChangeAt, seenAt);
  assert.equal(update.lastSeenAt, seenAt);
});

test("keeps the original available since date for still visible offers", () => {
  const seenAt = new Date("2026-06-13T08:00:00.000Z");
  const availableSince = new Date("2026-06-10T08:00:00.000Z");
  const lastAvailabilityChangeAt = new Date("2026-06-10T08:00:00.000Z");
  const update = getSeenAvailabilityUpdate(
    { isAvailable: true, availableSince, lastAvailabilityChangeAt },
    seenAt,
  );

  assert.equal(update.eventType, undefined);
  assert.equal(update.availableSince, availableSince);
  assert.equal(update.lastAvailabilityChangeAt, lastAvailabilityChangeAt);
  assert.equal(update.lastSeenAt, seenAt);
});

test("marks a previously unavailable offer as returned", () => {
  const seenAt = new Date("2026-06-13T08:00:00.000Z");
  const update = getSeenAvailabilityUpdate({ isAvailable: false }, seenAt);

  assert.equal(update.eventType, "returned");
  assert.equal(update.availableSince, seenAt);
  assert.equal(update.lastAvailabilityChangeAt, seenAt);
  assert.equal(update.unavailableSince, null);
});

test("records disappearance only once while offer stays unavailable", () => {
  assert.equal(shouldRecordDisappearance({ isAvailable: true }), true);
  assert.equal(shouldRecordDisappearance({ isAvailable: undefined }), true);
  assert.equal(shouldRecordDisappearance({ isAvailable: false }), false);
});

test("keeps reserved offers separate from disappeared offers", () => {
  assert.equal(
    getCarAvailabilityStatus({
      isAvailable: false,
      rawData: { reservationLabelCode: "reserved" },
    }),
    "reserved",
  );
});

test("uses persisted availability when raw data has no reservation status", () => {
  assert.equal(getCarAvailabilityStatus({ isAvailable: true }), "available");
  assert.equal(getCarAvailabilityStatus({ isAvailable: false }), "disappeared");
});

test("formats elapsed availability duration in calendar days", () => {
  const now = new Date("2026-06-13T19:00:00.000Z");

  assert.equal(formatElapsedDuration("2026-06-13T08:00:00.000Z", now), "dziś");
  assert.equal(formatElapsedDuration("2026-06-12T08:00:00.000Z", now), "1 dnia");
  assert.equal(formatElapsedDuration("2026-06-09T08:00:00.000Z", now), "4 dni");
});

test("formats elapsed availability events as ago text", () => {
  const now = new Date("2026-06-13T19:00:00.000Z");

  assert.equal(formatElapsedAgo("2026-06-13T08:00:00.000Z", now), "dzisiaj");
  assert.equal(formatElapsedAgo("2026-06-12T08:00:00.000Z", now), "1 dzień temu");
  assert.equal(formatElapsedAgo("2026-06-09T08:00:00.000Z", now), "4 dni temu");
});

test("formats current car availability summary with elapsed days", () => {
  const now = new Date("2026-06-13T19:00:00.000Z");

  assert.equal(
    formatAvailabilitySummary(
      createAvailabilityCar({
        availableSince: "2026-06-09T08:00:00.000Z",
      }),
      now,
    ),
    "dostępna od 4 dni",
  );
});

test("formats returned and disappeared car availability summaries", () => {
  const now = new Date("2026-06-13T19:00:00.000Z");

  assert.equal(
    formatAvailabilitySummary(
      createAvailabilityCar({
        availabilityHistory: [
          createAvailabilityEvent("returned", "2026-06-12T08:00:00.000Z"),
        ],
      }),
      now,
    ),
    "wróciła 1 dzień temu",
  );
  assert.equal(
    formatAvailabilitySummary(
      createAvailabilityCar({
        availabilityStatus: "disappeared",
        isAvailable: false,
        unavailableSince: "2026-06-09T08:00:00.000Z",
      }),
      now,
    ),
    "zniknęła 4 dni temu",
  );
});

function createAvailabilityCar(
  overrides: Partial<CarOfferView> = {},
): CarOfferView {
  return {
    id: "availability-test",
    source: "arval",
    purchaseOption: "release",
    externalId: "availability-test",
    imageUrls: [],
    equipmentItems: [],
    fullName: "Availability Test",
    brand: "Codex",
    model: "Status",
    details: {},
    latestPrices: [],
    isAvailable: true,
    availabilityStatus: "available",
    availabilityHistory: [],
    hasPriceChanged: false,
    isWatchlisted: false,
    priceHistory: [],
    ...overrides,
  };
}

function createAvailabilityEvent(
  eventType: CarOfferView["availabilityHistory"][number]["eventType"],
  eventAt: string,
): CarOfferView["availabilityHistory"][number] {
  return {
    id: `${eventType}-${eventAt}`,
    purchaseOption: "release",
    eventType,
    status: eventType === "disappeared" ? "unavailable" : "available",
    eventAt,
  };
}
