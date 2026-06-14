import { connectToDatabase } from "../db";
import { applyDealScores, applyDealScoresWithContext } from "../deals";
import { getCarAvailabilityStatus } from "../availability";
import { AvailabilityEvent, CarOffer, PriceSnapshot } from "../models/car";
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
  AvailabilityEventView,
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

  const offers = (await CarOffer.find(query).lean()) as LeanCarOffer[];
  const latestListUpdate = offers.reduce<Date | undefined>((latest, offer) => {
    const updatedAt = offer.updatedAt;

    if (!updatedAt) return latest;
    if (!latest || updatedAt > latest) return updatedAt;

    return latest;
  }, undefined);
  const sort = filters.sort || "newest";
  const settings = await getAppSettings();

  if (canUseFastOfferPagination(filters, sort)) {
    const filteredOffers = offers.filter((offer) => {
      if (
        filters.availableOnly &&
        getCarAvailabilityStatus(offer) !== "available"
      ) {
        return false;
      }
      if (filters.watchlistedOnly && !offer.isWatchlisted) return false;
      return true;
    });
    const sortedOffers = sortLeanOffers(filteredOffers, sort);
    const total = sortedOffers.length;
    const pageSize = filters.pageSize || 30;

    if (pageSize === "all") {
      const views = sortedOffers.map((offer) =>
        buildCarView(offer, purchaseOption, [], []),
      );
      const hydratedCars = await hydrateFullHistories(views, sortedOffers);

      return {
        cars: applyDealScores(hydratedCars, settings.dealScoreWeights),
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
    const pageOffers = sortedOffers.slice(start, start + pageSize);
    const pageViews = pageOffers.map((offer) =>
      buildCarView(offer, purchaseOption, [], []),
    );
    const hydratedPageCars = await hydrateFullHistories(pageViews, pageOffers);

    return {
      cars: applyDealScores(hydratedPageCars, settings.dealScoreWeights),
      total,
      page,
      pageSize,
      totalPages,
      listUpdatedAt: latestListUpdate?.toISOString(),
    };
  }

  const offerIds = offers.map((offer) => offer._id);
  const [recentHistories, recentAvailabilityEvents] = await Promise.all([
    getRecentHistories(offerIds, 2),
    getRecentAvailabilityEvents(offerIds, 5),
  ]);

  const views = offers.map((offer) =>
    buildCarView(
      offer,
      purchaseOption,
      recentHistories.get(String(offer._id)) || [],
      recentAvailabilityEvents.get(String(offer._id)) || [],
    ),
  );

  const filteredViews = views.filter((view) => {
    if (filters.changedOnly && !view.hasPriceChanged) return false;
    if (filters.availableOnly && !view.isAvailable) return false;
    if (filters.watchlistedOnly && !view.isWatchlisted) return false;
    return true;
  });
  const sortableViews =
    sort === "dealScoreDesc"
      ? applyDealScores(filteredViews, settings.dealScoreWeights)
      : filteredViews;
  const sortedViews = sortCars(sortableViews, sort);
  const total = sortedViews.length;
  const pageSize = filters.pageSize || 30;

  if (pageSize === "all") {
    const hydratedCars = await hydrateFullHistories(sortedViews, offers);

    return {
      cars:
        sort === "dealScoreDesc"
          ? hydratedCars
          : applyDealScoresWithContext(
              filteredViews,
              hydratedCars,
              settings.dealScoreWeights,
            ),
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
  const pageCars = sortedViews.slice(start, start + pageSize);
  const hydratedPageCars = await hydrateFullHistories(pageCars, offers);

  return {
    cars:
      sort === "dealScoreDesc"
        ? hydratedPageCars
        : applyDealScoresWithContext(
            filteredViews,
            hydratedPageCars,
            settings.dealScoreWeights,
          ),
    total,
    page,
    pageSize,
    totalPages,
    listUpdatedAt: latestListUpdate?.toISOString(),
  };
}

type LeanCarOffer = {
  _id: Types.ObjectId;
  externalId: string;
  offerUrl?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  equipmentItems?: string[] | null;
  fullName: string;
  brand: string;
  model: string;
  firstRegistrationDate?: string | null;
  registrationNumber?: string | null;
  labelCode?: string | null;
  details?: {
    mileage?: number | null;
    annualMileage?: number | null;
    registrationYear?: number | null;
    fuelTypeLabel?: string | null;
    gearbox?: string | null;
    warrantyMonths?: number | null;
    contractMonths?: number | null;
    downPayment?: number | null;
    powerHp?: number | null;
  } | null;
  rawCreatedAt?: Date | null;
  rawUpdatedAt?: Date | null;
  rawData?: unknown;
  isAvailable?: boolean | null;
  availableSince?: Date | null;
  unavailableSince?: Date | null;
  lastSeenAt?: Date | null;
  lastAvailabilityChangeAt?: Date | null;
  isWatchlisted?: boolean | null;
  updatedAt?: Date | null;
};

function buildCarView(
  offer: LeanCarOffer,
  purchaseOption: PurchaseOption,
  history: PriceSnapshotView[],
  availabilityHistory: AvailabilityEventView[],
): CarOfferView {
  const latest = history.at(-1);
  const availabilityStatus = getCarAvailabilityStatus(offer);
  const isAvailable = availabilityStatus === "available";

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
    priceDelta: getPrimaryPriceDelta(history.map((snapshot) => snapshot.prices)),
    isAvailable,
    availabilityStatus,
    availableSince: offer.availableSince?.toISOString(),
    unavailableSince: offer.unavailableSince?.toISOString(),
    lastSeenAt: offer.lastSeenAt?.toISOString(),
    lastAvailabilityChangeAt: offer.lastAvailabilityChangeAt?.toISOString(),
    availabilityHistory,
    hasPriceChanged: hasPriceChanged(history.map((snapshot) => snapshot.prices)),
    isWatchlisted: Boolean(offer.isWatchlisted),
    priceHistory: history,
  };
}

async function hydrateFullHistories(
  cars: CarOfferView[],
  offers: LeanCarOffer[],
): Promise<CarOfferView[]> {
  if (cars.length === 0) {
    return cars;
  }

  const offersById = new Map(offers.map((offer) => [String(offer._id), offer]));
  const offerIds = cars
    .map((car) => offersById.get(car.id)?._id)
    .filter((id): id is Types.ObjectId => Boolean(id));
  const [histories, availabilityEvents] = await Promise.all([
    getHistories(offerIds),
    getRecentAvailabilityEvents(offerIds, 10),
  ]);

  return cars.map((car) => {
    const offer = offersById.get(car.id);

    if (!offer) {
      return car;
    }

    return {
      ...buildCarView(
        offer,
        car.purchaseOption,
        histories.get(car.id) || [],
        availabilityEvents.get(car.id) || [],
      ),
      dealScore: car.dealScore,
    };
  });
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
    { projection: { _id: 1, isWatchlisted: 1 }, returnDocument: "after" },
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

function canUseFastOfferPagination(
  filters: GetCarsFilters,
  sort: NonNullable<GetCarsFilters["sort"]>,
): boolean {
  return !filters.changedOnly && (sort === "newest" || sort === "oldest");
}

function sortLeanOffers(
  offers: LeanCarOffer[],
  sort: NonNullable<GetCarsFilters["sort"]>,
): LeanCarOffer[] {
  return [...offers].sort((left, right) => {
    const leftTimestamp = getOfferSortTimestamp(left);
    const rightTimestamp = getOfferSortTimestamp(right);

    return sort === "oldest"
      ? leftTimestamp - rightTimestamp
      : rightTimestamp - leftTimestamp;
  });
}

function getOfferSortTimestamp(offer: LeanCarOffer): number {
  return (
    offer.updatedAt?.getTime() ||
    offer.rawUpdatedAt?.getTime() ||
    offer.rawCreatedAt?.getTime() ||
    0
  );
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
    addHistorySnapshot(histories, mapSnapshotToView(snapshot));
  }

  return histories;
}

async function getRecentHistories(
  offerIds: Types.ObjectId[],
  limit: number,
): Promise<Map<string, PriceSnapshotView[]>> {
  const histories = new Map<string, PriceSnapshotView[]>();

  if (offerIds.length === 0) {
    return histories;
  }

  const groupedSnapshots = await PriceSnapshot.aggregate<{
    _id: Types.ObjectId;
    snapshots: Array<{
      _id: Types.ObjectId;
      offerId: Types.ObjectId;
      purchaseOption: unknown;
      fetchedAt: Date;
      rawUpdatedAt?: Date;
      prices: number[];
    }>;
  }>([
    { $match: { offerId: { $in: offerIds } } },
    { $sort: { offerId: 1, fetchedAt: -1 } },
    {
      $group: {
        _id: "$offerId",
        snapshots: {
          $push: {
            _id: "$_id",
            offerId: "$offerId",
            purchaseOption: "$purchaseOption",
            fetchedAt: "$fetchedAt",
            rawUpdatedAt: "$rawUpdatedAt",
            prices: "$prices",
          },
        },
      },
    },
    { $project: { snapshots: { $slice: ["$snapshots", limit] } } },
  ]);

  for (const group of groupedSnapshots) {
    for (const snapshot of group.snapshots.reverse()) {
      addHistorySnapshot(histories, mapSnapshotToView(snapshot));
    }
  }

  return histories;
}

async function getRecentAvailabilityEvents(
  offerIds: Types.ObjectId[],
  limit: number,
): Promise<Map<string, AvailabilityEventView[]>> {
  const histories = new Map<string, AvailabilityEventView[]>();

  if (offerIds.length === 0) {
    return histories;
  }

  const groupedEvents = await AvailabilityEvent.aggregate<{
    _id: Types.ObjectId;
    events: Array<{
      _id: Types.ObjectId;
      purchaseOption: unknown;
      eventType: unknown;
      status: unknown;
      eventAt: Date;
    }>;
  }>([
    { $match: { offerId: { $in: offerIds } } },
    { $sort: { offerId: 1, eventAt: -1 } },
    {
      $group: {
        _id: "$offerId",
        events: {
          $push: {
            _id: "$_id",
            purchaseOption: "$purchaseOption",
            eventType: "$eventType",
            status: "$status",
            eventAt: "$eventAt",
          },
        },
      },
    },
    { $project: { events: { $slice: ["$events", limit] } } },
  ]);

  for (const group of groupedEvents) {
    histories.set(
      String(group._id),
      group.events.reverse().map(mapAvailabilityEventToView),
    );
  }

  return histories;
}

function addHistorySnapshot(
  histories: Map<string, PriceSnapshotView[]>,
  snapshot: HistorySnapshotView,
) {
  const { offerId, ...snapshotView } = snapshot;
  const history = histories.get(offerId) || [];
  history.push(snapshotView);
  histories.set(offerId, history);
}

type HistorySnapshotView = PriceSnapshotView & { offerId: string };

function mapAvailabilityEventToView(event: {
  _id: Types.ObjectId;
  purchaseOption: unknown;
  eventType: unknown;
  status: unknown;
  eventAt: Date;
}): AvailabilityEventView {
  return {
    id: String(event._id),
    purchaseOption: normalizePurchaseOption(event.purchaseOption),
    eventType: normalizeAvailabilityEventType(event.eventType),
    status: event.status === "unavailable" ? "unavailable" : "available",
    eventAt: event.eventAt.toISOString(),
  };
}

function mapSnapshotToView(snapshot: {
  _id: Types.ObjectId;
  offerId: Types.ObjectId;
  purchaseOption: unknown;
  fetchedAt: Date;
  rawUpdatedAt?: Date | null;
  prices: number[];
}): HistorySnapshotView {
  return {
    id: String(snapshot._id),
    offerId: String(snapshot.offerId),
    purchaseOption: normalizePurchaseOption(snapshot.purchaseOption),
    fetchedAt: snapshot.fetchedAt.toISOString(),
    rawUpdatedAt: snapshot.rawUpdatedAt?.toISOString(),
    prices: snapshot.prices,
  };
}

function normalizeAvailabilityEventType(value: unknown) {
  if (value === "returned") return "returned";
  if (value === "disappeared") return "disappeared";
  return "firstSeen";
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
  const rawDataPowerHp = getRawDataExplicitPowerHp(rawData);

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
    powerHp: details.powerHp ?? rawDataPowerHp ?? parsedPowerHp,
  };
}

function getRawDataExplicitPowerHp(rawData: unknown): number | undefined {
  if (!rawData || typeof rawData !== "object") {
    return undefined;
  }

  const record = rawData as {
    horsePower?: number | string | null;
    power?: number | string | null;
    trim?: string;
  };

  return normalizeArvalPowerHp({
    horsePower: record.horsePower,
    power: record.power,
  });
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
