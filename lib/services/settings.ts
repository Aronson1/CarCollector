import { DatabaseUnavailableError, connectToDatabase } from "../db";
import { defaultDealScoreWeights } from "../deals";
import {
  defaultCayenneDealScoreWeights,
  normalizeCayenneDealScoreWeights,
  type CayenneDealScoreWeights,
} from "../cayenne";
import { normalizeDealPushThresholds } from "../settings-utils";
import {
  AppSetting,
  CarOffer,
  CollectorRun,
  PushSubscription,
} from "../models/car";
import { CayenneOffer } from "../models/cayenne";
import type {
  DealPushThresholds,
  DealScoreWeights,
  DealScoreWeightsByPurchaseOption,
  PurchaseOption,
} from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";

const settingsKey = "default";
const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

export interface AppSettingsView {
  dealPushThreshold: number;
  dealPushThresholds: DealPushThresholds;
  dealScoreWeights: DealScoreWeights;
  dealScoreWeightsByPurchaseOption: DealScoreWeightsByPurchaseOption;
  cayenneDealPushThreshold: number;
  cayenneDealScoreWeights: CayenneDealScoreWeights;
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
  source: "arval" | "cayenne";
  score?: number;
  notifiedAt: string;
  offerUrl?: string;
}

export interface UpdateAppSettingsInput {
  dealPushThreshold?: unknown;
  dealPushThresholds?: Partial<Record<PurchaseOption, unknown>>;
  dealScoreWeights?: Partial<Record<keyof DealScoreWeights, unknown>>;
  dealScoreWeightsByPurchaseOption?: Partial<
    Record<PurchaseOption, Partial<Record<keyof DealScoreWeights, unknown>>>
  >;
  cayenneDealPushThreshold?: unknown;
  cayenneDealScoreWeights?: Partial<
    Record<keyof CayenneDealScoreWeights, unknown>
  >;
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
  const dealPushThresholds = normalizeDealPushThresholds(
    {
      ...current.dealPushThresholds,
      ...parseDealPushThresholdsInput(input.dealPushThresholds),
    },
    clampInteger(input.dealPushThreshold, current.dealPushThreshold, 1, 100),
  );
  const dealScoreWeightsByPurchaseOption = normalizeWeightsByPurchaseOption(
    current.dealScoreWeightsByPurchaseOption,
    input.dealScoreWeightsByPurchaseOption,
    input.dealScoreWeights,
  );
  const nextSettings: AppSettingsView = {
    dealPushThreshold: dealPushThresholds.release,
    dealPushThresholds,
    dealScoreWeights: dealScoreWeightsByPurchaseOption.release,
    dealScoreWeightsByPurchaseOption,
    cayenneDealPushThreshold: clampInteger(
      input.cayenneDealPushThreshold,
      current.cayenneDealPushThreshold,
      1,
      100,
    ),
    cayenneDealScoreWeights: normalizeCayenneDealScoreWeights({
      ...current.cayenneDealScoreWeights,
      ...parseCayenneWeightInput(input.cayenneDealScoreWeights),
    }),
  };

  const updated = await AppSetting.findOneAndUpdate(
    { key: settingsKey },
    {
      $set: {
        dealPushThreshold: nextSettings.dealPushThreshold,
        dealPushThresholds: nextSettings.dealPushThresholds,
        dealScoreWeights: nextSettings.dealScoreWeights,
        dealScoreWeightsByPurchaseOption:
          nextSettings.dealScoreWeightsByPurchaseOption,
        cayenneDealPushThreshold: nextSettings.cayenneDealPushThreshold,
        cayenneDealScoreWeights: nextSettings.cayenneDealScoreWeights,
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
        dealPushThresholds: getDefaultDealPushThresholds(60),
        dealScoreWeights: defaultDealScoreWeights,
        dealScoreWeightsByPurchaseOption:
          getDefaultDealScoreWeightsByPurchaseOption(defaultDealScoreWeights),
        cayenneDealPushThreshold: 75,
        cayenneDealScoreWeights: defaultCayenneDealScoreWeights,
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

  const arvalHistory = offers.flatMap((offer) => {
    if (!offer.dealPushNotifiedAt) {
      return [];
    }

    return {
      id: String(offer._id),
      externalId: offer.externalId,
      fullName: offer.fullName,
      source: "arval" as const,
      offerUrl: offer.offerUrl || undefined,
      score: offer.dealPushNotifiedScore ?? undefined,
      notifiedAt: offer.dealPushNotifiedAt.toISOString(),
    };
  });

  const cayenneOffers = await CayenneOffer.find(
    { dealPushNotifiedAt: { $exists: true } },
    {
      _id: 1,
      externalId: 1,
      title: 1,
      offerUrl: 1,
      dealPushNotifiedAt: 1,
      dealPushNotifiedScore: 1,
    },
  )
    .sort({ dealPushNotifiedAt: -1 })
    .limit(20)
    .lean();

  const cayenneHistory = cayenneOffers.flatMap((offer) => {
    if (!offer.dealPushNotifiedAt) {
      return [];
    }

    return {
      id: String(offer._id),
      externalId: offer.externalId,
      fullName: offer.title,
      source: "cayenne" as const,
      offerUrl: offer.offerUrl || undefined,
      score: offer.dealPushNotifiedScore ?? undefined,
      notifiedAt: offer.dealPushNotifiedAt.toISOString(),
    };
  });

  return [...arvalHistory, ...cayenneHistory]
    .sort(
      (left, right) =>
        new Date(right.notifiedAt).getTime() -
        new Date(left.notifiedAt).getTime(),
    )
    .slice(0, 20);
}

function getDefaultSettingsDocument() {
  return {
    key: settingsKey,
    dealPushThreshold: 60,
    dealPushThresholds: getDefaultDealPushThresholds(60),
    dealScoreWeights: defaultDealScoreWeights,
    dealScoreWeightsByPurchaseOption:
      getDefaultDealScoreWeightsByPurchaseOption(defaultDealScoreWeights),
    cayenneDealPushThreshold: 75,
    cayenneDealScoreWeights: defaultCayenneDealScoreWeights,
  };
}

function mapSettings(settings: {
  dealPushThreshold?: number | null;
  dealPushThresholds?: Partial<DealPushThresholds> | null;
  dealScoreWeights?: Partial<DealScoreWeights> | null;
  dealScoreWeightsByPurchaseOption?: Partial<
    Record<PurchaseOption, Partial<DealScoreWeights> | null>
  > | null;
  cayenneDealPushThreshold?: number | null;
  cayenneDealScoreWeights?: Partial<CayenneDealScoreWeights> | null;
  updatedAt?: Date;
}): AppSettingsView {
  const legacyThreshold = clampInteger(settings.dealPushThreshold, 60, 1, 100);
  const dealPushThresholds = normalizeDealPushThresholds(
    settings.dealPushThresholds || {},
    legacyThreshold,
  );
  const dealScoreWeights = normalizeWeights(settings.dealScoreWeights || {});
  const dealScoreWeightsByPurchaseOption = normalizeWeightsByPurchaseOption(
    getDefaultDealScoreWeightsByPurchaseOption(dealScoreWeights),
    settings.dealScoreWeightsByPurchaseOption,
  );

  return {
    dealPushThreshold: dealPushThresholds.release,
    dealPushThresholds,
    dealScoreWeights,
    dealScoreWeightsByPurchaseOption,
    cayenneDealPushThreshold: clampInteger(
      settings.cayenneDealPushThreshold,
      75,
      1,
      100,
    ),
    cayenneDealScoreWeights: normalizeCayenneDealScoreWeights(
      settings.cayenneDealScoreWeights || {},
    ),
    updatedAt: settings.updatedAt?.toISOString(),
  };
}

function parseDealPushThresholdsInput(
  thresholds: UpdateAppSettingsInput["dealPushThresholds"],
): Partial<DealPushThresholds> {
  if (!thresholds || typeof thresholds !== "object") {
    return {};
  }

  return {
    release: parseFiniteNumber(thresholds.release),
    sale: parseFiniteNumber(thresholds.sale),
    newRelease: parseFiniteNumber(thresholds.newRelease),
  };
}

function getDefaultDealPushThresholds(value: number): DealPushThresholds {
  return {
    release: value,
    sale: value,
    newRelease: value,
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

function parseCayenneWeightInput(
  weights: UpdateAppSettingsInput["cayenneDealScoreWeights"],
): Partial<CayenneDealScoreWeights> {
  if (!weights || typeof weights !== "object") {
    return {};
  }

  return {
    vatFinancing: parseFiniteNumber(weights.vatFinancing),
    price: parseFiniteNumber(weights.price),
    accidentFree: parseFiniteNumber(weights.accidentFree),
    mileage: parseFiniteNumber(weights.mileage),
  };
}

function normalizeWeightsByPurchaseOption(
  currentWeights: DealScoreWeightsByPurchaseOption,
  inputWeights?:
    | UpdateAppSettingsInput["dealScoreWeightsByPurchaseOption"]
    | Partial<Record<PurchaseOption, Partial<DealScoreWeights> | null>>
    | null,
  legacyInputWeights?: UpdateAppSettingsInput["dealScoreWeights"],
): DealScoreWeightsByPurchaseOption {
  const legacyWeights = parseWeightInput(legacyInputWeights);

  return {
    release: normalizeWeights(
      mergeWeightInput(
        currentWeights.release,
        inputWeights?.release || legacyWeights,
      ),
    ),
    sale: normalizeWeights(
      mergeWeightInput(currentWeights.sale, inputWeights?.sale || legacyWeights),
    ),
    newRelease: normalizeWeights(
      mergeWeightInput(
        currentWeights.newRelease,
        inputWeights?.newRelease || legacyWeights,
      ),
    ),
  };
}

function mergeWeightInput(
  currentWeights: DealScoreWeights,
  inputWeights: UpdateAppSettingsInput["dealScoreWeights"],
): Partial<DealScoreWeights> {
  return {
    ...currentWeights,
    ...parseWeightInput(inputWeights),
  };
}

function getDefaultDealScoreWeightsByPurchaseOption(
  weights: DealScoreWeights,
): DealScoreWeightsByPurchaseOption {
  return {
    release: weights,
    sale: weights,
    newRelease: weights,
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
