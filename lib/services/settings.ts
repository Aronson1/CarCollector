import { DatabaseUnavailableError, connectToDatabase } from "../db";
import { defaultDealScoreWeights } from "../deals";
import {
  AppSetting,
  CarOffer,
  CollectorRun,
  PushSubscription,
} from "../models/car";
import type { DealScoreWeights, PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";

const settingsKey = "default";
const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

export interface AppSettingsView {
  dealPushThreshold: number;
  dealScoreWeights: DealScoreWeights;
  updatedAt?: string;
}

export interface SettingsStatus {
  generatedAt: string;
  database: {
    connected: boolean;
    message: string;
  };
  settings: AppSettingsView;
  collectors: Array<{
    purchaseOption: PurchaseOption;
    label: string;
    updatedAt?: string;
    status?: "success" | "error";
    fetched?: number;
    snapshotsCreated?: number;
    skippedUnchanged?: number;
  }>;
  saleGallery: {
    updatedAt?: string;
    offersWithGallery: number;
  };
  push: {
    configured: boolean;
    enabled: boolean;
    subscriptionCount: number;
    history: PushHistoryItem[];
  };
}

export interface PushHistoryItem {
  id: string;
  externalId: string;
  fullName: string;
  score?: number;
  notifiedAt: string;
  offerUrl?: string;
}

export interface UpdateAppSettingsInput {
  dealPushThreshold?: unknown;
  dealScoreWeights?: Partial<Record<keyof DealScoreWeights, unknown>>;
}

export async function getAppSettings(): Promise<AppSettingsView> {
  await connectToDatabase();

  const settings = await AppSetting.findOneAndUpdate(
    { key: settingsKey },
    { $setOnInsert: getDefaultSettingsDocument() },
    { returnDocument: "after", upsert: true },
  ).lean();

  return mapSettings(settings);
}

export async function updateAppSettings(
  input: UpdateAppSettingsInput,
): Promise<AppSettingsView> {
  await connectToDatabase();

  const current = await getAppSettings();
  const nextSettings: AppSettingsView = {
    dealPushThreshold: clampInteger(
      input.dealPushThreshold,
      current.dealPushThreshold,
      1,
      100,
    ),
    dealScoreWeights: normalizeWeights({
      ...current.dealScoreWeights,
      ...parseWeightInput(input.dealScoreWeights),
    }),
  };

  const updated = await AppSetting.findOneAndUpdate(
    { key: settingsKey },
    {
      $set: {
        dealPushThreshold: nextSettings.dealPushThreshold,
        dealScoreWeights: nextSettings.dealScoreWeights,
      },
      $setOnInsert: { key: settingsKey },
    },
    { returnDocument: "after", upsert: true },
  ).lean();

  return mapSettings(updated);
}

export async function getSettingsStatus(): Promise<SettingsStatus> {
  try {
    await connectToDatabase();
    await ensurePurchaseOptionMigration();

    const [
      settings,
      runs,
      saleGalleryUpdate,
      offersWithGallery,
      subscriptionCount,
      pushHistory,
    ] = await Promise.all([
      getAppSettings(),
      CollectorRun.find({ purchaseOption: { $in: purchaseOptions } })
        .sort({ finishedAt: -1 })
        .lean(),
      CarOffer.findOne({
        purchaseOption: "sale",
        "imageUrls.0": { $exists: true },
      })
        .sort({ updatedAt: -1 })
        .lean(),
      CarOffer.countDocuments({
        purchaseOption: "sale",
        "imageUrls.0": { $exists: true },
      }),
      PushSubscription.countDocuments({}),
      getPushHistory(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      database: {
        connected: true,
        message: "Połączono z bazą danych.",
      },
      settings,
      collectors: purchaseOptions.map((purchaseOption) => {
        const run = runs.find((item) => item.purchaseOption === purchaseOption);
        return {
          purchaseOption,
          label: getPurchaseOptionLabel(purchaseOption),
          updatedAt: run?.finishedAt?.toISOString(),
          status: run?.status,
          fetched: run?.fetched || 0,
          snapshotsCreated: run?.snapshotsCreated || 0,
          skippedUnchanged: run?.skippedUnchanged || 0,
        };
      }),
      saleGallery: {
        updatedAt: saleGalleryUpdate?.updatedAt?.toISOString(),
        offersWithGallery,
      },
      push: {
        configured: isPushConfigured(),
        enabled: isPushConfigured() && subscriptionCount > 0,
        subscriptionCount,
        history: pushHistory,
      },
    };
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) {
      throw error;
    }

    return {
      generatedAt: new Date().toISOString(),
      database: {
        connected: false,
        message: error.message,
      },
      settings: {
        dealPushThreshold: 60,
        dealScoreWeights: defaultDealScoreWeights,
      },
      collectors: purchaseOptions.map((purchaseOption) => ({
        purchaseOption,
        label: getPurchaseOptionLabel(purchaseOption),
      })),
      saleGallery: {
        offersWithGallery: 0,
      },
      push: {
        configured: isPushConfigured(),
        enabled: false,
        subscriptionCount: 0,
        history: [],
      },
    };
  }
}

async function getPushHistory(): Promise<PushHistoryItem[]> {
  const offers = await CarOffer.find(
    { dealPushNotifiedAt: { $exists: true } },
    {
      _id: 1,
      externalId: 1,
      fullName: 1,
      offerUrl: 1,
      dealPushNotifiedAt: 1,
      dealPushNotifiedScore: 1,
    },
  )
    .sort({ dealPushNotifiedAt: -1 })
    .limit(20)
    .lean();

  return offers.flatMap((offer) => {
    if (!offer.dealPushNotifiedAt) {
      return [];
    }

    return {
      id: String(offer._id),
      externalId: offer.externalId,
      fullName: offer.fullName,
      offerUrl: offer.offerUrl || undefined,
      score: offer.dealPushNotifiedScore ?? undefined,
      notifiedAt: offer.dealPushNotifiedAt.toISOString(),
    };
  });
}

function getDefaultSettingsDocument() {
  return {
    key: settingsKey,
    dealPushThreshold: 60,
    dealScoreWeights: defaultDealScoreWeights,
  };
}

function mapSettings(settings: {
  dealPushThreshold?: number | null;
  dealScoreWeights?: Partial<DealScoreWeights> | null;
  updatedAt?: Date;
}): AppSettingsView {
  return {
    dealPushThreshold: clampInteger(settings.dealPushThreshold, 60, 1, 100),
    dealScoreWeights: normalizeWeights(settings.dealScoreWeights || {}),
    updatedAt: settings.updatedAt?.toISOString(),
  };
}

function parseWeightInput(
  weights: UpdateAppSettingsInput["dealScoreWeights"],
): Partial<DealScoreWeights> {
  if (!weights || typeof weights !== "object") {
    return {};
  }

  return {
    price: parseFiniteNumber(weights.price),
    power: parseFiniteNumber(weights.power),
    year: parseFiniteNumber(weights.year),
  };
}

export function normalizeWeights(
  weights: Partial<DealScoreWeights>,
): DealScoreWeights {
  const positiveWeights = {
    price: clampNumber(weights.price, defaultDealScoreWeights.price, 0, 1),
    power: clampNumber(weights.power, defaultDealScoreWeights.power, 0, 1),
    year: clampNumber(weights.year, defaultDealScoreWeights.year, 0, 1),
  };
  const total =
    positiveWeights.price + positiveWeights.power + positiveWeights.year;

  if (total <= 0) {
    return defaultDealScoreWeights;
  }

  return {
    price: roundWeight(positiveWeights.price / total),
    power: roundWeight(positiveWeights.power / total),
    year: roundWeight(positiveWeights.year / total),
  };
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), min), max);
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

function getPurchaseOptionLabel(purchaseOption: PurchaseOption) {
  if (purchaseOption === "sale") return "Zakup używanych";
  if (purchaseOption === "newRelease") return "Najem nowych";
  return "Najem używanych";
}
