import { connectToDatabase } from "../db";
import { applyDealScores } from "../deals";
import { CarOffer, PriceSnapshot } from "../models/car";
import { parsePowerHp } from "../power";
import {
  getPrimaryPriceDelta,
  hasPriceChanged,
  normalizeArvalEquipmentItems,
  normalizeArvalPowerHp,
} from "../prices";
import type {
  CarDetails,
  CarOfferView,
  PriceSnapshotView,
  PurchaseOption,
} from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";
import { getAppSettings } from "./settings";
import { Types } from "mongoose";

export interface GetCarsFilters {
  purchaseOption?: PurchaseOption;
  id?: string;
  brand?: string;
  model?: string;
  changedOnly?: boolean;
  availableOnly?: boolean;
  watchlistedOnly?: boolean;
  yearFrom?: number;
  yearTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
  powerHpFrom?: number;
  powerHpTo?: number;
  fuelType?: string;
  gearbox?: string;
  contractMonthsFrom?: number;
  contractMonthsTo?: number;
  annualMileageFrom?: number;
  annualMileageTo?: number;
  downPaymentFrom?: number;
  downPaymentTo?: number;
  sort?:
    | "newest"
    | "oldest"
    | "priceAsc"
    | "priceDesc"
    | "powerAsc"
    | "powerDesc"
    | "deltaAsc"
    | "deltaDesc"
    | "dealScoreDesc";
  page?: number;
  pageSize?: number | "all";
}

export interface CarFilterOptions {
  brands: string[];
  models: string[];
  fuelTypes: string[];
  gearboxes: string[];
}

export interface CarSearchResult {
  cars: CarOfferView[];
  total: number;
  page: number;
  pageSize: number | "all";
  totalPages: number;
  listUpdatedAt?: string;
}

export async function getCarFilterOptions(
  purchaseOption: PurchaseOption = "release",
  brand?: string,
): Promise<CarFilterOptions> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  const modelQuery = brand
    ? {
        purchaseOption,
        brand: { $regex: escapeRegex(brand), $options: "i" },
      }
    : { purchaseOption };

  const [brands, models, fuelTypes, gearboxes] = await Promise.all([
    CarOffer.distinct("brand", { purchaseOption }),
    CarOffer.distinct("model", modelQuery),
    CarOffer.distinct("details.fuelTypeLabel", { purchaseOption }),
    CarOffer.distinct("details.gearbox", { purchaseOption }),
  ]);

  return {
    brands: sortStrings(brands),
    models: sortStrings(models),
    fuelTypes: sortStrings(fuelTypes),
    gearboxes: sortStrings(gearboxes),
  };
}

export async function getCars(filters: GetCarsFilters): Promise<CarSearchResult> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();
  const purchaseOption = filters.purchaseOption || "release";

  const query: {
    purchaseOption: PurchaseOption;
    externalId?: string;
    brand?: { $regex: string; $options: string };
    model?: { $regex: string; $options: string };
    "details.registrationYear"?: NumberRangeQuery;
    "details.mileage"?: NumberRangeQuery;
    "details.powerHp"?: NumberRangeQuery;
    "details.fuelTypeLabel"?: { $regex: string; $options: string };
    "details.gearbox"?: { $regex: string; $options: string };
    "details.contractMonths"?: NumberRangeQuery;
    "details.annualMileage"?: NumberRangeQuery;
    "details.downPayment"?: NumberRangeQuery;
  } = { purchaseOption };

  if (filters.id) {
    query.externalId = filters.id;
  }

  if (filters.brand) {
    query.brand = { $regex: escapeRegex(filters.brand), $options: "i" };
  }

  if (filters.model) {
    query.model = { $regex: escapeRegex(filters.model), $options: "i" };
  }

  addNumberRangeQuery(
    query,
    "details.registrationYear",
    filters.yearFrom,
    filters.yearTo,
  );
  addNumberRangeQuery(
    query,
    "details.mileage",
    filters.mileageFrom,
    filters.mileageTo,
  );
  addNumberRangeQuery(
    query,
    "details.powerHp",
    filters.powerHpFrom,
    filters.powerHpTo,
  );
  addNumberRangeQuery(
    query,
    "details.contractMonths",
    filters.contractMonthsFrom,
    filters.contractMonthsTo,
  );
  addNumberRangeQuery(
    query,
    "details.annualMileage",
    filters.annualMileageFrom,
    filters.annualMileageTo,
  );
  addNumberRangeQuery(
    query,
    "details.downPayment",
    filters.downPaymentFrom,
    filters.downPaymentTo,
  );

  if (filters.fuelType) {
    query["details.fuelTypeLabel"] = {
      $regex: escapeRegex(filters.fuelType),
      $options: "i",
    };
  }

  if (filters.gearbox) {
    query["details.gearbox"] = {
      $regex: escapeRegex(filters.gearbox),
      $options: "i",
    };
  }

  const offers = await CarOffer.find(query).lean();
  const histories = await getHistories(offers.map((offer) => offer._id));
  const latestListUpdate = offers.reduce<Date | undefined>((latest, offer) => {
    const updatedAt = offer.updatedAt;

    if (!updatedAt) return latest;
    if (!latest || updatedAt > latest) return updatedAt;

    return latest;
  }, undefined);

  const views = offers.map((offer) => {
      const history = histories.get(String(offer._id)) || [];
      const latest = history.at(-1);

      return {
        id: String(offer._id),
        source: "arval",
        purchaseOption,
        externalId: offer.externalId,
        offerUrl: offer.offerUrl || undefined,
        imageUrl: offer.imageUrl || undefined,
        imageUrls: getImageUrls(offer.imageUrl, offer.imageUrls),
        equipmentItems: getEquipmentItems(offer.equipmentItems, offer.rawData),
        fullName: offer.fullName,
        brand: offer.brand,
        model: offer.model,
        firstRegistrationDate: offer.firstRegistrationDate || undefined,
        registrationNumber: offer.registrationNumber || undefined,
        labelCode: offer.labelCode || undefined,
        announcementCreatedAt: offer.rawCreatedAt?.toISOString(),
        announcementUpdatedAt: offer.rawUpdatedAt?.toISOString(),
        details: sanitizeDetails(offer.details, offer.fullName, offer.rawData),
        latestPrices: latest?.prices || [],
        latestFetchedAt: latest?.fetchedAt,
        priceDelta: getPrimaryPriceDelta(
          history.map((snapshot) => snapshot.prices),
        ),
        isAvailable: isOfferAvailable(offer.rawData),
        hasPriceChanged: hasPriceChanged(history.map((snapshot) => snapshot.prices)),
        isWatchlisted: Boolean(offer.isWatchlisted),
        priceHistory: history,
      } satisfies CarOfferView;
    });

  const settings = await getAppSettings();
  const scoredViews = applyDealScores(views, settings.dealScoreWeights);
  const filteredViews = scoredViews.filter((view) => {
    if (filters.changedOnly && !view.hasPriceChanged) return false;
    if (filters.availableOnly && !view.isAvailable) return false;
    if (filters.watchlistedOnly && !view.isWatchlisted) return false;
    return true;
  });
  const sortedViews = sortCars(filteredViews, filters.sort || "newest");
  const total = sortedViews.length;
  const pageSize = filters.pageSize || 30;

  if (pageSize === "all") {
    return {
      cars: sortedViews,
      total,
      page: 1,
      pageSize,
      totalPages: 1,
      listUpdatedAt: latestListUpdate?.toISOString(),
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(filters.page || 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    cars: sortedViews.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
    listUpdatedAt: latestListUpdate?.toISOString(),
  };
}

export async function setCarWatchlistStatus(
  id: string,
  isWatchlisted: boolean,
): Promise<{ id: string; isWatchlisted: boolean } | null> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  if (!Types.ObjectId.isValid(id)) {
    return null;
  }

  const offer = await CarOffer.findByIdAndUpdate(
    id,
    { $set: { isWatchlisted } },
    { new: true, projection: { _id: 1, isWatchlisted: 1 } },
  ).lean();

  if (!offer) {
    return null;
  }

  return {
    id: String(offer._id),
    isWatchlisted: Boolean(offer.isWatchlisted),
  };
}

type NumberRangeQuery = {
  $gte?: number;
  $lte?: number;
};

function addNumberRangeQuery<
  TQuery extends Record<string, unknown>,
  TKey extends keyof TQuery,
>(
  query: TQuery,
  key: TKey,
  from?: number,
  to?: number,
) {
  const range: NumberRangeQuery = {};

  if (typeof from === "number") range.$gte = from;
  if (typeof to === "number") range.$lte = to;

  if (Object.keys(range).length > 0) {
    query[key] = range as TQuery[TKey];
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortStrings(values: unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort((left, right) => left.localeCompare(right, "pl"));
}

function sortCars(
  cars: CarOfferView[],
  sort: NonNullable<GetCarsFilters["sort"]>,
): CarOfferView[] {
  return [...cars].sort((left, right) => {
    if (sort === "oldest") {
      return timestamp(left) - timestamp(right);
    }

    if (sort === "priceAsc") {
      return price(left) - price(right);
    }

    if (sort === "priceDesc") {
      return price(right) - price(left);
    }

    if (sort === "powerAsc") {
      return power(left) - power(right);
    }

    if (sort === "powerDesc") {
      return power(right) - power(left);
    }

    if (sort === "deltaAsc") {
      return comparePriceDelta(left, right, "asc");
    }

    if (sort === "deltaDesc") {
      return comparePriceDelta(left, right, "desc");
    }

    if (sort === "dealScoreDesc") {
      return dealScore(right) - dealScore(left);
    }

    return timestamp(right) - timestamp(left);
  });
}

async function getHistories(
  offerIds: Types.ObjectId[],
): Promise<Map<string, PriceSnapshotView[]>> {
  const histories = new Map<string, PriceSnapshotView[]>();

  if (offerIds.length === 0) {
    return histories;
  }

  const snapshots = await PriceSnapshot.find({ offerId: { $in: offerIds } })
    .sort({ fetchedAt: 1 })
    .lean();

  for (const snapshot of snapshots) {
    const offerId = String(snapshot.offerId);
    const history = histories.get(offerId) || [];
    history.push({
      id: String(snapshot._id),
      purchaseOption: normalizePurchaseOption(snapshot.purchaseOption),
      fetchedAt: snapshot.fetchedAt.toISOString(),
      rawUpdatedAt: snapshot.rawUpdatedAt?.toISOString(),
      prices: snapshot.prices,
    });
    histories.set(offerId, history);
  }

  return histories;
}

function normalizePurchaseOption(value: unknown): PurchaseOption {
  if (value === "sale") return "sale";
  if (value === "newRelease") return "newRelease";
  return "release";
}

function timestamp(car: CarOfferView): number {
  return car.latestFetchedAt ? new Date(car.latestFetchedAt).getTime() : 0;
}

function price(car: CarOfferView): number {
  const currentPrice = car.latestPrices.find((value) => value > 0);
  return currentPrice ?? Number.MAX_SAFE_INTEGER;
}

function power(car: CarOfferView): number {
  return car.details.powerHp ?? 0;
}

function dealScore(car: CarOfferView): number {
  return car.dealScore?.score ?? 0;
}

function comparePriceDelta(
  left: CarOfferView,
  right: CarOfferView,
  direction: "asc" | "desc",
): number {
  const leftDelta = left.priceDelta?.amount;
  const rightDelta = right.priceDelta?.amount;

  if (leftDelta === undefined && rightDelta === undefined) return 0;
  if (leftDelta === undefined) return 1;
  if (rightDelta === undefined) return -1;

  return direction === "asc" ? leftDelta - rightDelta : rightDelta - leftDelta;
}

function isOfferAvailable(rawData: unknown): boolean {
  if (!rawData || typeof rawData !== "object") {
    return false;
  }

  const record = rawData as {
    reservationLabelCode?: unknown;
    status?: unknown;
  };

  if (
    typeof record.reservationLabelCode === "string" &&
    record.reservationLabelCode.toLowerCase() === "available"
  ) {
    return true;
  }

  return (
    typeof record.status === "string" &&
    record.status.toLowerCase() === "published"
  );
}

function sanitizeDetails(details: {
  mileage?: number | null;
  annualMileage?: number | null;
  registrationYear?: number | null;
  fuelTypeLabel?: string | null;
  gearbox?: string | null;
  warrantyMonths?: number | null;
  contractMonths?: number | null;
  downPayment?: number | null;
  powerHp?: number | null;
} | null | undefined, fullName?: string, rawData?: unknown): CarDetails {
  const parsedPowerHp = parsePowerHp(fullName);
  const rawDataPowerHp = getRawDataPowerHp(rawData);

  if (!details) {
    return {
      powerHp: rawDataPowerHp ?? parsedPowerHp,
    };
  }

  return {
    mileage: details.mileage ?? undefined,
    annualMileage: details.annualMileage ?? undefined,
    registrationYear: details.registrationYear ?? undefined,
    fuelTypeLabel: details.fuelTypeLabel ?? undefined,
    gearbox: details.gearbox ?? undefined,
    warrantyMonths: details.warrantyMonths ?? undefined,
    contractMonths: details.contractMonths ?? undefined,
    downPayment: details.downPayment ?? undefined,
    powerHp: rawDataPowerHp ?? details.powerHp ?? parsedPowerHp,
  };
}

function getRawDataPowerHp(rawData: unknown): number | undefined {
  if (!rawData || typeof rawData !== "object") {
    return undefined;
  }

  const record = rawData as {
    horsePower?: number | string | null;
    power?: number | string | null;
    trim?: string;
  };

  return normalizeArvalPowerHp(record);
}

function getImageUrls(
  imageUrl?: string | null,
  imageUrls?: string[] | null,
): string[] {
  return Array.from(
    new Set([imageUrl || undefined, ...(imageUrls || [])].filter(Boolean)),
  ) as string[];
}

function getEquipmentItems(
  equipmentItems?: string[] | null,
  rawData?: unknown,
): string[] {
  const storedItems = uniqueStrings(equipmentItems || []);

  if (storedItems.length > 0) {
    return storedItems;
  }

  if (!rawData || typeof rawData !== "object") {
    return [];
  }

  return normalizeArvalEquipmentItems(rawData);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
