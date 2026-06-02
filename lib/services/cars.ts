import { connectToDatabase } from "../db";
import { applyDealScores } from "../deals";
import { CarOffer, PriceSnapshot } from "../models/car";
import { parsePowerHp } from "../power";
import { getPrimaryPriceDelta, hasPriceChanged } from "../prices";
import type {
  CarDetails,
  CarOfferView,
  PriceSnapshotView,
  PurchaseOption,
} from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";
import type { Types } from "mongoose";

export interface GetCarsFilters {
  purchaseOption?: PurchaseOption;
  id?: string;
  brand?: string;
  model?: string;
  changedOnly?: boolean;
  availableOnly?: boolean;
  sort?:
    | "newest"
    | "oldest"
    | "priceAsc"
    | "priceDesc"
    | "deltaAsc"
    | "deltaDesc"
    | "dealScoreDesc";
  page?: number;
  pageSize?: number | "all";
}

export interface CarFilterOptions {
  brands: string[];
  models: string[];
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

  const [brands, models] = await Promise.all([
    CarOffer.distinct("brand", { purchaseOption }),
    CarOffer.distinct("model", modelQuery),
  ]);

  return {
    brands: sortStrings(brands),
    models: sortStrings(models),
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
        fullName: offer.fullName,
        brand: offer.brand,
        model: offer.model,
        firstRegistrationDate: offer.firstRegistrationDate || undefined,
        registrationNumber: offer.registrationNumber || undefined,
        labelCode: offer.labelCode || undefined,
        announcementCreatedAt: offer.rawCreatedAt?.toISOString(),
        announcementUpdatedAt: offer.rawUpdatedAt?.toISOString(),
        details: sanitizeDetails(offer.details, offer.fullName),
        latestPrices: latest?.prices || [],
        latestFetchedAt: latest?.fetchedAt,
        priceDelta: getPrimaryPriceDelta(
          history.map((snapshot) => snapshot.prices),
        ),
        isAvailable: isOfferAvailable(offer.rawData),
        hasPriceChanged: hasPriceChanged(history.map((snapshot) => snapshot.prices)),
        priceHistory: history,
      } satisfies CarOfferView;
    });

  const filteredViews = views.filter((view) => {
    if (filters.changedOnly && !view.hasPriceChanged) return false;
    if (filters.availableOnly && !view.isAvailable) return false;
    return true;
  });
  const scoredViews = applyDealScores(filteredViews);
  const sortedViews = sortCars(scoredViews, filters.sort || "newest");
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
} | null | undefined, fullName?: string): CarDetails {
  const parsedPowerHp = parsePowerHp(fullName);

  if (!details) {
    return {
      powerHp: parsedPowerHp,
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
    powerHp: details.powerHp ?? parsedPowerHp,
  };
}
