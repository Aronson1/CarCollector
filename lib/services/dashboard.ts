import { connectToDatabase } from "../db";
import { CarOffer, CollectorRun, PriceSnapshot } from "../models/car";
import type { PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";

const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];
const dashboardPeriodDays = 7;

export interface DashboardStats {
  generatedAt: string;
  periodDays: number;
  totals: DashboardTotals;
  byPurchaseOption: DashboardPurchaseOptionStats[];
  largestDrops: DashboardPriceDrop[];
  averagePrices: DashboardAveragePrice[];
  lastRun?: DashboardCollectorRun;
  latestSnapshotAt?: string;
}

export interface DashboardTotals {
  offers: number;
  newToday: number;
  newInPeriod: number;
  priceDrops: number;
  averagePrice?: number;
}

export interface DashboardPurchaseOptionStats extends DashboardTotals {
  purchaseOption: PurchaseOption;
}

export interface DashboardPriceDrop {
  id: string;
  externalId: string;
  purchaseOption: PurchaseOption;
  brand: string;
  model: string;
  fullName: string;
  currentPrice: number;
  previousPrice: number;
  amount: number;
  percent: number;
}

export interface DashboardAveragePrice {
  purchaseOption: PurchaseOption;
  brand: string;
  model: string;
  count: number;
  averagePrice: number;
}

export interface DashboardCollectorRun {
  purchaseOption: PurchaseOption | "all";
  status: "success" | "error" | "inferred";
  finishedAt: string;
  fetched: number;
  snapshotsCreated: number;
  skippedUnchanged: number;
  message?: string;
}

interface OfferMetric {
  id: string;
  externalId: string;
  purchaseOption: PurchaseOption;
  brand: string;
  model: string;
  fullName: string;
  createdAt?: Date;
  currentPrice?: number;
  previousPrice?: number;
}

interface SnapshotSummary {
  _id: unknown;
  latestFetchedAt?: Date;
  latestPrices?: number[];
  previousPrices?: number[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  const offers = await CarOffer.find({}).lean();
  const offerIds = offers.map((offer) => offer._id);
  const [snapshotSummaries, latestSnapshot] = await Promise.all([
    getSnapshotSummaries(offerIds),
    PriceSnapshot.findOne({}).sort({ fetchedAt: -1 }).lean(),
  ]);
  const snapshotByOfferId = new Map(
    snapshotSummaries.map((snapshot) => [String(snapshot._id), snapshot]),
  );

  const metrics: OfferMetric[] = offers.map((offer) => {
    const snapshot = snapshotByOfferId.get(String(offer._id));

    return {
      id: String(offer._id),
      externalId: offer.externalId,
      purchaseOption: normalizePurchaseOption(offer.purchaseOption),
      brand: offer.brand,
      model: offer.model,
      fullName: offer.fullName,
      createdAt: offer.createdAt,
      currentPrice: firstPositivePrice(snapshot?.latestPrices || []),
      previousPrice: firstPositivePrice(snapshot?.previousPrices || []),
    };
  });

  const today = startOfToday();
  const periodStart = daysAgo(dashboardPeriodDays);

  return {
    generatedAt: new Date().toISOString(),
    periodDays: dashboardPeriodDays,
    totals: summarizeMetrics(metrics, today, periodStart),
    byPurchaseOption: purchaseOptions.map((purchaseOption) => ({
      purchaseOption,
      ...summarizeMetrics(
        metrics.filter((metric) => metric.purchaseOption === purchaseOption),
        today,
        periodStart,
      ),
    })),
    largestDrops: getLargestDrops(metrics),
    averagePrices: getAveragePrices(metrics),
    lastRun: await getLastRun(latestSnapshot?.fetchedAt),
    latestSnapshotAt: latestSnapshot?.fetchedAt.toISOString(),
  };
}

function getSnapshotSummaries(offerIds: unknown[]): Promise<SnapshotSummary[]> {
  if (offerIds.length === 0) {
    return Promise.resolve([]);
  }

  return PriceSnapshot.aggregate<SnapshotSummary>([
    { $match: { offerId: { $in: offerIds } } },
    { $sort: { offerId: 1, fetchedAt: -1 } },
    {
      $group: {
        _id: "$offerId",
        latestFetchedAt: { $first: "$fetchedAt" },
        prices: { $push: "$prices" },
      },
    },
    {
      $project: {
        latestFetchedAt: 1,
        latestPrices: { $arrayElemAt: ["$prices", 0] },
        previousPrices: { $arrayElemAt: ["$prices", 1] },
      },
    },
  ]);
}

function summarizeMetrics(
  metrics: OfferMetric[],
  today: Date,
  periodStart: Date,
): DashboardTotals {
  const prices = metrics
    .map((metric) => metric.currentPrice)
    .filter((price): price is number => price !== undefined);

  return {
    offers: metrics.length,
    newToday: metrics.filter((metric) => isOnOrAfter(metric.createdAt, today))
      .length,
    newInPeriod: metrics.filter((metric) =>
      isOnOrAfter(metric.createdAt, periodStart),
    ).length,
    priceDrops: metrics.filter((metric) => {
      const delta = getPriceDelta(metric);
      return Boolean(delta && delta.amount < 0);
    }).length,
    averagePrice: average(prices),
  };
}

function getLargestDrops(metrics: OfferMetric[]): DashboardPriceDrop[] {
  return metrics
    .map((metric) => {
      const delta = getPriceDelta(metric);

      if (!delta || delta.amount >= 0 || !metric.currentPrice || !metric.previousPrice) {
        return null;
      }

      return {
        id: metric.id,
        externalId: metric.externalId,
        purchaseOption: metric.purchaseOption,
        brand: metric.brand,
        model: metric.model,
        fullName: metric.fullName,
        currentPrice: metric.currentPrice,
        previousPrice: metric.previousPrice,
        amount: delta.amount,
        percent: delta.percent,
      };
    })
    .filter((drop): drop is DashboardPriceDrop => Boolean(drop))
    .sort((left, right) => left.amount - right.amount)
    .slice(0, 6);
}

function getAveragePrices(metrics: OfferMetric[]): DashboardAveragePrice[] {
  const groups = new Map<
    string,
    {
      purchaseOption: PurchaseOption;
      brand: string;
      model: string;
      prices: number[];
    }
  >();

  for (const metric of metrics) {
    if (!metric.currentPrice) {
      continue;
    }

    const key = `${metric.purchaseOption}:${metric.brand}:${metric.model}`;
    const group =
      groups.get(key) ||
      {
        purchaseOption: metric.purchaseOption,
        brand: metric.brand,
        model: metric.model,
        prices: [],
      };
    group.prices.push(metric.currentPrice);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      purchaseOption: group.purchaseOption,
      brand: group.brand,
      model: group.model,
      count: group.prices.length,
      averagePrice: average(group.prices) || 0,
    }))
    .sort((left, right) => right.count - left.count || right.averagePrice - left.averagePrice)
    .slice(0, 10);
}

async function getLastRun(
  latestSnapshotAt?: Date,
): Promise<DashboardCollectorRun | undefined> {
  const run = await CollectorRun.findOne({}).sort({ finishedAt: -1 }).lean();

  if (run) {
    return {
      purchaseOption: normalizeCollectorPurchaseOption(run.purchaseOption),
      status: run.status === "error" ? "error" : "success",
      finishedAt: run.finishedAt.toISOString(),
      fetched: run.fetched || 0,
      snapshotsCreated: run.snapshotsCreated || 0,
      skippedUnchanged: run.skippedUnchanged || 0,
      message: run.message || undefined,
    };
  }

  if (!latestSnapshotAt) {
    return undefined;
  }

  return {
    purchaseOption: "all",
    status: "inferred",
    finishedAt: latestSnapshotAt.toISOString(),
    fetched: 0,
    snapshotsCreated: 0,
    skippedUnchanged: 0,
  };
}

function getPriceDelta(metric: OfferMetric) {
  if (!metric.currentPrice || !metric.previousPrice) {
    return undefined;
  }

  const amount = metric.currentPrice - metric.previousPrice;

  return {
    amount,
    percent: metric.previousPrice > 0 ? (amount / metric.previousPrice) * 100 : 0,
  };
}

function firstPositivePrice(prices: number[]): number | undefined {
  return prices.find((price) => Number.isFinite(price) && price > 0);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function isOnOrAfter(value: Date | undefined, threshold: Date): boolean {
  return Boolean(value && value >= threshold);
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function normalizePurchaseOption(value: unknown): PurchaseOption {
  if (value === "sale") return "sale";
  if (value === "newRelease") return "newRelease";
  return "release";
}

function normalizeCollectorPurchaseOption(value: unknown): PurchaseOption | "all" {
  if (value === "all") return "all";
  return normalizePurchaseOption(value);
}
