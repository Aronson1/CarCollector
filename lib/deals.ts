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
  const priceFactor = scoreLowerIsBetter(currentPrice(car), stats.prices, 0);
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
      year: yearFactor,
      power: powerFactor,
    }),
    factors: {
      price: roundFactor(priceFactor),
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

function getDealReasons(
  car: CarOfferView,
  factors: {
    price: number;
    year: number;
    power: number;
  },
): string[] {
  const reasons: string[] = [];

  if (factors.power >= 0.75 && car.details.powerHp) {
    reasons.push("wysoka moc");
  }
  if (factors.price >= 0.75) reasons.push("niska cena w wynikach");
  if (factors.year >= 0.75 && car.details.registrationYear) {
    reasons.push("młody rocznik");
  }
  return reasons.length > 0 ? reasons : ["przeciętne parametry w wynikach"];
}

function roundFactor(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
