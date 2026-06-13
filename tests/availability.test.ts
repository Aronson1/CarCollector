import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeenAvailabilityUpdate,
  shouldRecordDisappearance,
} from "../lib/availability.ts";

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
