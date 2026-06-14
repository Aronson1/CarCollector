import type { CarOfferView, DealScoreWeights } from "./types";

export const defaultDealScoreWeights: DealScoreWeights = {
  power: 0.45,
  price: 0.45,
  year: 0.1,
};

interface Range {
  min: number;
  max: number;
}

interface DealStats {
  prices: Range;
  years: Range;
  mileages: Range;
  powers: Range;
  similarOfferComparisons: Map<string, SimilarOfferComparison>;
}

interface SimilarOfferComparison {
  averagePrice: number;
  count: number;
  priceDifferencePercent: number;
}

export function applyDealScores(
  cars: CarOfferView[],
  scoreWeights: DealScoreWeights = defaultDealScoreWeights,
): CarOfferView[] {
  const stats = getDealStats(cars);

  return cars.map((car) => ({
    ...car,
    dealScore: calculateDealScore(car, stats, scoreWeights),
  }));
}

function calculateDealScore(
  car: CarOfferView,
  stats: DealStats,
  scoreWeights: DealScoreWeights,
) {
  const globalPriceFactor = scoreLowerIsBetter(
    currentPrice(car),
    stats.prices,
    0,
  );
  const similarOfferComparison = stats.similarOfferComparisons.get(car.id);
  const similarPriceFactor = similarOfferComparison
    ? scoreSimilarPrice(similarOfferComparison)
    : globalPriceFactor;
  const priceFactor = similarOfferComparison
    ? globalPriceFactor * 0.3 + similarPriceFactor * 0.7
    : globalPriceFactor;
  const yearFactor = scoreHigherIsBetter(
    car.details.registrationYear,
    stats.years,
    0.5,
  );
  const powerFactor = scoreHigherIsBetter(
    car.details.powerHp,
    stats.powers,
    0,
  );
  const score = Math.round(
    100 *
      (powerFactor * scoreWeights.power +
        priceFactor * scoreWeights.price +
        yearFactor * scoreWeights.year),
  );

  return {
    score,
    reasons: getDealReasons(car, {
      price: priceFactor,
      similarOfferComparison,
      year: yearFactor,
      power: powerFactor,
    }),
    similarOffers: similarOfferComparison,
    factors: {
      price: roundFactor(priceFactor),
      similarPrice: roundFactor(similarPriceFactor),
      year: roundFactor(yearFactor),
      mileage: 0,
      trend: 0,
      power: roundFactor(powerFactor),
      equipment: 0,
    },
  };
}

function getDealStats(cars: CarOfferView[]): DealStats {
  return {
    prices: getRange(cars.map(currentPrice)),
    years: getRange(cars.map((car) => car.details.registrationYear)),
    mileages: getRange(cars.map((car) => car.details.mileage)),
    powers: getRange(cars.map((car) => car.details.powerHp)),
    similarOfferComparisons: getSimilarOfferComparisons(cars),
  };
}

function getRange(values: Array<number | undefined>): Range {
  const finiteValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (finiteValues.length === 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
}

function currentPrice(car: CarOfferView): number | undefined {
  return car.latestPrices.find((value) => value > 0);
}

function scoreLowerIsBetter(
  value: number | undefined,
  range: Range,
  fallback: number,
): number {
  if (!value || range.max <= 0) return fallback;
  if (range.min === range.max) return 0.5;

  return clamp01((range.max - value) / (range.max - range.min));
}

function scoreHigherIsBetter(
  value: number | undefined,
  range: Range,
  fallback: number,
): number {
  if (!value || range.max <= 0) return fallback;
  if (range.min === range.max) return 0.5;

  return clamp01((value - range.min) / (range.max - range.min));
}

function scoreSimilarPrice(comparison: SimilarOfferComparison): number {
  return clamp01(0.5 - comparison.priceDifferencePercent / 40);
}

function getSimilarOfferComparisons(
  cars: CarOfferView[],
): Map<string, SimilarOfferComparison> {
  const comparisons = new Map<string, SimilarOfferComparison>();
  const pricedCars = cars.filter((car) => currentPrice(car));

  for (const car of pricedCars) {
    const strictPeers = pricedCars.filter(
      (peer) =>
        peer.id !== car.id &&
        isSameMarketSegment(car, peer) &&
        hasSimilarDetails(car, peer),
    );
    const fallbackPeers = pricedCars.filter(
      (peer) => peer.id !== car.id && isSameMarketSegment(car, peer),
    );
    const peers = strictPeers.length >= 2 ? strictPeers : fallbackPeers;
    const price = currentPrice(car);
    const peerPrices = peers
      .map(currentPrice)
      .filter((value): value is number => Boolean(value));

    if (!price || peerPrices.length < 2) {
      continue;
    }

    const averagePrice =
      peerPrices.reduce((total, value) => total + value, 0) / peerPrices.length;

    comparisons.set(car.id, {
      averagePrice: Math.round(averagePrice),
      count: peerPrices.length,
      priceDifferencePercent: Math.round(
        ((price - averagePrice) / averagePrice) * 1000,
      ) / 10,
    });
  }

  return comparisons;
}

function isSameMarketSegment(left: CarOfferView, right: CarOfferView): boolean {
  return (
    left.purchaseOption === right.purchaseOption &&
    normalizeText(left.brand) === normalizeText(right.brand) &&
    normalizeText(left.model) === normalizeText(right.model)
  );
}

function hasSimilarDetails(left: CarOfferView, right: CarOfferView): boolean {
  return (
    isSimilarNumber(
      left.details.registrationYear,
      right.details.registrationYear,
      2,
    ) &&
    isSimilarNumber(
      left.details.mileage,
      right.details.mileage,
      getMileageTolerance(left.details.mileage),
    ) &&
    isSimilarNumber(
      left.details.powerHp,
      right.details.powerHp,
      getPowerTolerance(left.details.powerHp),
    )
  );
}

function isSimilarNumber(
  left: number | undefined,
  right: number | undefined,
  tolerance: number,
): boolean {
  if (!left || !right) {
    return true;
  }

  return Math.abs(left - right) <= tolerance;
}

function getMileageTolerance(mileage: number | undefined): number {
  return Math.max(20000, (mileage || 0) * 0.3);
}

function getPowerTolerance(powerHp: number | undefined): number {
  return Math.max(30, (powerHp || 0) * 0.2);
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("pl");
}

function getDealReasons(
  car: CarOfferView,
  factors: {
    price: number;
    similarOfferComparison?: SimilarOfferComparison;
    year: number;
    power: number;
  },
): string[] {
  const reasons: string[] = [];
  const similarDiscount = factors.similarOfferComparison
    ? -factors.similarOfferComparison.priceDifferencePercent
    : 0;

  if (similarDiscount >= 5) {
    reasons.push(`${formatPercent(similarDiscount)} tańsza od podobnych ofert`);
  }

  if (factors.power >= 0.75 && car.details.powerHp) {
    reasons.push("wysoka moc");
  }
  if (factors.price >= 0.75 && similarDiscount < 5) {
    reasons.push("niska cena w wynikach");
  }
  if (factors.year >= 0.75 && car.details.registrationYear) {
    reasons.push("młody rocznik");
  }
  return reasons.length > 0 ? reasons : ["przeciętne parametry w wynikach"];
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function roundFactor(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
