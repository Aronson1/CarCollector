import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPriceChanged,
  normalizeArvalAnnouncement,
  normalizePriceVector,
  pricesEqual,
} from "../lib/prices.ts";

test("normalizes Arval price fields into a stable vector", () => {
  assert.deepEqual(
    normalizePriceVector({
      reLeasePriceNet: "1200",
      reLeasePrice2Net: 1350,
      reLeasePrice3Net: null,
    }),
    [1200, 1350, 0],
  );
});

test("normalizes Arval sale price into a stable vector", () => {
  assert.deepEqual(
    normalizePriceVector(
      {
        salePriceNet: "109674",
      },
      "sale",
    ),
    [109674],
  );
});

test("detects identical price vectors for snapshot deduplication", () => {
  assert.equal(pricesEqual([1200, 1350, 0], [1200, 1350, 0]), true);
  assert.equal(pricesEqual([1200, 1350, 0], [1200, 1400, 0]), false);
});

test("detects meaningful price changes while ignoring zero placeholders", () => {
  assert.equal(hasPriceChanged([[0, 0, 0], [1200, 0, 0], [1200, 0, 0]]), false);
  assert.equal(hasPriceChanged([[1200, 0, 0], [1250, 0, 0]]), true);
});

test("maps an Arval announcement into the internal offer shape", () => {
  const offer = normalizeArvalAnnouncement({
    id: 42,
    offerUrl: "https://example.com/offers/42",
    mainUrl: "https://example.com/image.jpg",
    trim: "Volvo XC60 Momentum",
    make: "Volvo",
    model: "XC60",
    updatedAt: "2025-04-10T09:00:00.000Z",
    purchaseOption: "release",
    reLeasePriceNet: 2300,
    reLeasePrice2Net: 2400,
    reLeasePrice3Net: 0,
  });

  assert.equal(offer.source, "arval");
  assert.equal(offer.purchaseOption, "release");
  assert.equal(offer.externalId, "42");
  assert.equal(offer.fullName, "Volvo XC60 Momentum");
  assert.deepEqual(offer.prices, [2300, 2400, 0]);
  assert.equal(offer.rawUpdatedAt?.toISOString(), "2025-04-10T09:00:00.000Z");
});

test("maps an Arval sale announcement into a separate offer shape", () => {
  const offer = normalizeArvalAnnouncement(
    {
      id: 42,
      offerUrl: "https://example.com/offers/42",
      trim: "Volvo XC60 Momentum",
      make: "Volvo",
      model: "XC60",
      salePriceNet: 109674,
    },
    "sale",
  );

  assert.equal(offer.source, "arval");
  assert.equal(offer.purchaseOption, "sale");
  assert.equal(offer.externalId, "42");
  assert.deepEqual(offer.prices, [109674]);
});
