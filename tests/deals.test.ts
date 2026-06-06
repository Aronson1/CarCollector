import assert from "node:assert/strict";
import test from "node:test";
import { applyDealScores } from "../lib/deals.ts";
import type { CarOfferView } from "../lib/types.ts";

test("scores stronger cheaper younger cars higher", () => {
  const [better, worse] = applyDealScores([
    createCar({
      fullName: "Better car",
      latestPrices: [1000],
      registrationYear: 2025,
      powerHp: 250,
    }),
    createCar({
      fullName: "Worse car",
      latestPrices: [2000],
      registrationYear: 2021,
      powerHp: 100,
    }),
  ]);

  assert.ok(better.dealScore);
  assert.ok(worse.dealScore);
  assert.ok(better.dealScore.score > worse.dealScore.score);
  assert.ok(better.dealScore.reasons.includes("niska cena w wynikach"));
  assert.ok(better.dealScore.reasons.includes("młody rocznik"));
  assert.ok(better.dealScore.reasons.includes("wysoka moc"));
});

test("does not use price drop history in deal scoring reasons", () => {
  const [car] = applyDealScores([
    createCar({
      latestPrices: [850],
      powerHp: 160,
      priceHistory: [
        { prices: [1100], fetchedAt: "2026-06-01T08:00:00.000Z" },
        { prices: [1000], fetchedAt: "2026-06-02T08:00:00.000Z" },
        { prices: [850], fetchedAt: "2026-06-03T08:00:00.000Z" },
      ],
      priceDelta: {
        amount: -150,
        percent: -15,
        previousPrice: 1000,
        latestPrice: 850,
      },
    }),
  ]);

  assert.ok(car.dealScore);
  assert.equal(car.dealScore.factors.trend, 0);
  assert.ok(!car.dealScore.reasons.some((reason) => reason.includes("spadek")));
});

test("rewards higher power when other deal factors are comparable", () => {
  const [stronger, weaker] = applyDealScores([
    createCar({
      fullName: "Stronger car",
      latestPrices: [1500],
      powerHp: 250,
    }),
    createCar({
      fullName: "Weaker car",
      latestPrices: [1500],
      powerHp: 100,
    }),
  ]);

  assert.ok(stronger.dealScore);
  assert.ok(weaker.dealScore);
  assert.ok(stronger.dealScore.score > weaker.dealScore.score);
  assert.ok(stronger.dealScore.reasons.includes("wysoka moc"));
});

test("does not use equipment in deal scoring", () => {
  const [equipped, basic] = applyDealScores([
    createCar({
      fullName: "Equipped car",
      latestPrices: [1500],
      powerHp: 180,
      equipmentItems: [
        "Kamera parkowania",
        "Tempomat adaptacyjny ACC",
        "Reflektory Matrix LED",
        "Podgrzewanie przednich foteli",
        "Apple CarPlay i Android Auto",
        "System bezkluczykowy KESSY",
      ],
    }),
    createCar({
      fullName: "Basic car",
      latestPrices: [1500],
      powerHp: 180,
      equipmentItems: ["Dywaniki welurowe"],
    }),
  ]);

  assert.ok(equipped.dealScore);
  assert.ok(basic.dealScore);
  assert.equal(equipped.dealScore.score, basic.dealScore.score);
  assert.equal(equipped.dealScore.factors.equipment, 0);
  assert.equal(basic.dealScore.factors.equipment, 0);
  assert.ok(
    !equipped.dealScore.reasons.some((reason) =>
      reason.includes("wyposażenie"),
    ),
  );
});

function createCar({
  fullName = "Car",
  latestPrices,
  registrationYear = 2024,
  mileage = 30000,
  powerHp,
  equipmentItems = [],
  priceDelta,
  priceHistory,
}: {
  fullName?: string;
  latestPrices: number[];
  registrationYear?: number;
  mileage?: number;
  powerHp?: number;
  equipmentItems?: string[];
  priceDelta?: CarOfferView["priceDelta"];
  priceHistory?: Array<{ prices: number[]; fetchedAt: string }>;
}): CarOfferView {
  return {
    id: fullName,
    source: "arval",
    purchaseOption: "release",
    externalId: fullName,
    imageUrls: [],
    equipmentItems,
    fullName,
    brand: "Codex",
    model: "Deal",
    details: {
      registrationYear,
      mileage,
      powerHp,
    },
    latestPrices,
    latestFetchedAt: "2026-06-03T08:00:00.000Z",
    priceDelta,
    isAvailable: false,
    hasPriceChanged: Boolean(priceDelta),
    priceHistory: (
      priceHistory || [
        {
          prices: latestPrices,
          fetchedAt: "2026-06-03T08:00:00.000Z",
        },
      ]
    ).map((snapshot, index) => ({
      id: `${fullName}-${index}`,
      purchaseOption: "release",
      fetchedAt: snapshot.fetchedAt,
      prices: snapshot.prices,
    })),
  };
}
