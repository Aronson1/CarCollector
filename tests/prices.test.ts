import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrimaryPriceDelta,
  hasPriceChanged,
  normalizeArvalAnnouncement,
  normalizeArvalNewCarOffer,
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

test("normalizes Arval new rental price into a stable vector", () => {
  assert.deepEqual(
    normalizePriceVector(
      {
        leasePrice: "1249",
        priceGridRental: 1300,
      },
      "newRelease",
    ),
    [1249],
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

test("calculates primary price delta from the latest two non-zero snapshots", () => {
  assert.deepEqual(getPrimaryPriceDelta([[0], [1200], [1100]]), {
    amount: -100,
    percent: -8.333333333333332,
    previousPrice: 1200,
    latestPrice: 1100,
  });
  assert.equal(getPrimaryPriceDelta([[0], [1400]]), undefined);
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

test("maps an Arval new car rental offer into the internal offer shape", () => {
  const offer = normalizeArvalNewCarOffer({
    offerId: 26015,
    makeName: "BYD",
    modelName: "Seal U DM-i",
    vehicleCatalogName: "Comfort PHEV",
    fuelTypeName: "Hybrydowy",
    transmissionTypeName: "Automatyczna",
    leasePrice: 1249,
    downPayment: 16211,
    duration: "36",
    mileage: "10000",
    imagePath: "https://example.com/car.png",
    url: "/wynajem-oferty/wynajem-dlugoterminowy-male-floty/byd/seal-u-dm-i/26015",
    updateDate: "2026-04-24T07:07:54Z",
  });

  assert.equal(offer.source, "arval");
  assert.equal(offer.purchaseOption, "newRelease");
  assert.equal(offer.externalId, "26015");
  assert.equal(offer.brand, "BYD");
  assert.equal(offer.model, "Seal U DM-i");
  assert.equal(offer.fullName, "BYD Seal U DM-i Comfort PHEV");
  assert.deepEqual(offer.prices, [1249]);
  assert.equal(offer.details.downPayment, 16211);
  assert.equal(offer.details.contractMonths, 36);
  assert.equal(offer.details.annualMileage, 10000);
  assert.equal(offer.offerUrl, "https://www.arval.pl/wynajem-oferty/wynajem-dlugoterminowy-male-floty/byd/seal-u-dm-i/26015");
});
