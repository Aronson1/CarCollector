import { connectToDatabase } from "../db";
import {
  AvailabilityEvent,
  CarOffer,
  CollectorRun,
  PriceSnapshot,
} from "../models/car";
import type { AvailabilityEventType, AvailabilityStatus } from "../types";
import type { PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";

const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];
const dashboardPeriodDays = 7;
export const defaultModelTrendDays = 90;
const maxModelTrendSeries = 12;

export interface DashboardStats {
  generatedAt: string;
  periodDays: number;
  totals: DashboardTotals;
  byPurchaseOption: DashboardPurchaseOptionStats[];
  largestDrops: DashboardPriceDrop[];
  averagePrices: DashboardAveragePrice[];
  modelPriceTrends: DashboardModelPriceTrend[];
  latestAvailabilityEvents: DashboardAvailabilityEvent[];
  modelTrendDays: number;
  lastRun?: DashboardCollectorRun;
  latestSnapshotAt?: string;
}

export interface DashboardTotals {
  offers: number;
  newToday: number;
  newInPeriod: number;
  priceDrops: number;
  unavailable: number;
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

export interface DashboardModelPriceTrend {
  key: string;
  purchaseOption: PurchaseOption;
  brand: string;
  model: string;
  label: string;
  observations: number;
  points: DashboardModelPriceTrendPoint[];
}

export interface DashboardModelPriceTrendPoint {
  date: string;
  averagePrice: number;
  count: number;
}

export interface DashboardAvailabilityEvent {
  id: string;
  purchaseOption: PurchaseOption;
  eventType: AvailabilityEventType;
  status: AvailabilityStatus;
  eventAt: string;
  externalId: string;
  brand: string;
  model: string;
  fullName: string;
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
  isAvailable: boolean;
}

interface SnapshotSummary {
  _id: unknown;
  latestFetchedAt?: Date;
  latestPrices?: number[];
  previousPrices?: number[];
}

interface ModelTrendAggregationRow {
  _id: {
    purchaseOption: unknown;
    brand: string;
    model: string;
    date: string;
  };
  averagePrice: number;
  count: number;
}

export async function getDashboardStats({
  modelTrendDays = defaultModelTrendDays,
}: {
  modelTrendDays?: number;
} = {}): Promise<DashboardStats> {
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
      isAvailable: offer.isAvailable ?? true,
    };
  });

  const today = startOfToday();
  const periodStart = daysAgo(dashboardPeriodDays);
  const [latestAvailabilityEvents, modelPriceTrends, lastRun] =
    await Promise.all([
      getLatestAvailabilityEvents(),
      getModelPriceTrends(modelTrendDays),
      getLastRun(latestSnapshot?.fetchedAt),
    ]);

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
    modelPriceTrends,
    latestAvailabilityEvents,
    modelTrendDays,
    lastRun,
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
    unavailable: metrics.filter((metric) => !metric.isAvailable).length,
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

async function getLatestAvailabilityEvents(): Promise<DashboardAvailabilityEvent[]> {
  const events = await AvailabilityEvent.find({})
    .sort({ eventAt: -1 })
    .limit(8)
    .populate<{
      offerId: {
        externalId: string;
        brand: string;
        model: string;
        fullName: string;
      } | null;
    }>("offerId", "externalId brand model fullName")
    .lean();

  return events
    .filter((event) => event.offerId)
    .map((event) => ({
      id: String(event._id),
      purchaseOption: normalizePurchaseOption(event.purchaseOption),
      eventType: normalizeAvailabilityEventType(event.eventType),
      status: event.status === "unavailable" ? "unavailable" : "available",
      eventAt: event.eventAt.toISOString(),
      externalId: event.offerId?.externalId || "",
      brand: event.offerId?.brand || "",
      model: event.offerId?.model || "",
      fullName: event.offerId?.fullName || "",
    }));
}

async function getModelPriceTrends(
  modelTrendDays: number,
): Promise<DashboardModelPriceTrend[]> {
  const rows = await PriceSnapshot.aggregate<ModelTrendAggregationRow>([
    { $match: { fetchedAt: { $gte: daysAgo(modelTrendDays) } } },
    {
      $project: {
        offerId: 1,
        purchaseOption: 1,
        fetchedAt: 1,
        primaryPrice: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$prices",
                as: "price",
                cond: { $gt: ["$$price", 0] },
              },
            },
            0,
          ],
        },
      },
    },
    { $match: { primaryPrice: { $gt: 0 } } },
    {
      $lookup: {
        from: CarOffer.collection.name,
        localField: "offerId",
        foreignField: "_id",
        as: "offer",
      },
    },
    { $unwind: "$offer" },
    {
      $group: {
        _id: {
          purchaseOption: "$purchaseOption",
          brand: "$offer.brand",
          model: "$offer.model",
          date: {
            $dateToString: {
              date: "$fetchedAt",
              format: "%Y-%m-%d",
            },
          },
        },
        averagePrice: { $avg: "$primaryPrice" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const trendsByKey = new Map<string, DashboardModelPriceTrend>();

  for (const row of rows) {
    const purchaseOption = normalizePurchaseOption(row._id.purchaseOption);
    const key = getModelTrendKey(
      purchaseOption,
      row._id.brand,
      row._id.model,
    );
    const trend =
      trendsByKey.get(key) ||
      {
        key,
        purchaseOption,
        brand: row._id.brand,
        model: row._id.model,
        label: `${row._id.brand} ${row._id.model} / ${getPurchaseOptionLabel(
          purchaseOption,
        )}`,
        observations: 0,
        points: [],
      };

    trend.observations += row.count;
    trend.points.push({
      date: row._id.date,
      averagePrice: Math.round(row.averagePrice),
      count: row.count,
    });
    trendsByKey.set(key, trend);
  }

  return Array.from(trendsByKey.values())
    .filter((trend) => trend.points.length >= 2)
    .sort(
      (left, right) =>
        right.observations - left.observations ||
        right.points.length - left.points.length ||
        left.label.localeCompare(right.label, "pl"),
    )
    .slice(0, maxModelTrendSeries);
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

function normalizeAvailabilityEventType(value: unknown): AvailabilityEventType {
  if (value === "returned") return "returned";
  if (value === "disappeared") return "disappeared";
  return "firstSeen";
}

function normalizeCollectorPurchaseOption(value: unknown): PurchaseOption | "all" {
  if (value === "all") return "all";
  return normalizePurchaseOption(value);
}

function getModelTrendKey(
  purchaseOption: PurchaseOption,
  brand: string,
  model: string,
) {
  return `${purchaseOption}:${brand}:${model}`;
}

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używane";
  if (purchaseOption === "newRelease") return "Najem nowe";
  return "Najem używane";
}
