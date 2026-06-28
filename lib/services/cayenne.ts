import { connectToDatabase } from "../db";
import {
  CayenneCollectorRun,
  CayenneOffer,
  CayennePriceSnapshot,
} from "../models/cayenne";
import {
  applyCayenneDealScores,
  buildCayenneOfferView,
  type CayenneGenerationFilter,
  normalizeOtomotoCayenneOffer,
  shouldCreateCayennePriceSnapshot,
  type CayennePriceSnapshotView,
  type CayenneSearchResult,
  type CayenneSort,
  type LeanCayenneOffer,
  type NormalizedCayenneOffer,
} from "../cayenne";
import { fetchOtomotoCayenneOffers } from "../sources/otomoto-cayenne";
import { sendCayenneDealPushNotifications } from "./push-notifications";
import { getAppSettings } from "./settings";
import { Types } from "mongoose";

export interface CayenneCollectorRunResult {
  source: "otomoto";
  fetched: number;
  offersUpserted: number;
  newOffers: number;
  priceChanges: number;
  disappeared: number;
  snapshotsCreated: number;
  dealPushNotificationsSent?: number;
}

export async function getCayenneOffers({
  generation = "currentAndPrevious",
  maxPrice,
  sort = "newest",
  changedOnly = false,
  watchlistedOnly = false,
}: {
  generation?: CayenneGenerationFilter;
  maxPrice?: number;
  sort?: CayenneSort;
  changedOnly?: boolean;
  watchlistedOnly?: boolean;
} = {}): Promise<CayenneSearchResult> {
  await connectToDatabase();

  const query: {
    isDamaged: { $ne: true };
    isImportOffer: { $ne: true };
    isWatchlisted?: true;
    price?: { $lte: number };
    year?: {
      $gte?: number;
      $lte?: number;
    };
  } = {
    isDamaged: { $ne: true },
    isImportOffer: { $ne: true },
  };

  if (generation === "current") {
    query.year = { $gte: 2017 };
  } else if (generation === "previous") {
    query.year = { $gte: 2010, $lte: 2016 };
  } else {
    query.year = { $gte: 2010 };
  }

  if (typeof maxPrice === "number" && Number.isFinite(maxPrice) && maxPrice > 0) {
    query.price = { $lte: maxPrice };
  }

  if (watchlistedOnly) {
    query.isWatchlisted = true;
  }

  const offers = (await CayenneOffer.find(query)
    .sort({ isAvailable: -1, firstSeenAt: -1 })
    .lean()) as LeanCayenneOffer[];
  const [histories, lastRun] = await Promise.all([
    getPriceHistories(offers.map((offer) => offer._id)),
    CayenneCollectorRun.findOne({ source: "otomoto" })
      .sort({ finishedAt: -1 })
      .lean(),
  ]);
  const views = offers.map((offer) =>
    buildCayenneOfferView(offer, histories.get(String(offer._id)) || []),
  );
  const settings = await getAppSettings();
  const scoredViews = applyCayenneDealScores(
    views,
    settings.cayenneDealScoreWeights,
  );
  const filteredViews = scoredViews.filter((view) => {
    if (changedOnly && !view.hasPriceChanged) return false;
    return true;
  });
  const sortedViews = sortCayenneOffers(filteredViews, sort);

  return {
    offers: sortedViews,
    total: sortedViews.length,
    lastRun: lastRun
      ? {
          status: lastRun.status === "error" ? "error" : "success",
          finishedAt: lastRun.finishedAt.toISOString(),
          fetched: lastRun.fetched || 0,
          newOffers: lastRun.newOffers || 0,
          priceChanges: lastRun.priceChanges || 0,
          disappeared: lastRun.disappeared || 0,
          dealPushNotificationsSent: lastRun.dealPushNotificationsSent || 0,
          message: lastRun.message || undefined,
        }
      : undefined,
  };
}

export async function runCayenneCollector(): Promise<CayenneCollectorRunResult> {
  await connectToDatabase();
  const startedAt = new Date();

  try {
    const rawOffers = await fetchOtomotoCayenneOffers();
    const normalizedOffers = rawOffers
      .map((offer) => normalizeOtomotoCayenneOffer(offer))
      .filter((offer): offer is NormalizedCayenneOffer => Boolean(offer));
    const result = await storeCayenneOffers(normalizedOffers, new Date());
    result.dealPushNotificationsSent = await sendCayenneDealPushNotifications();

    await recordCollectorRun(startedAt, result, "success");
    return result;
  } catch (error) {
    await recordCollectorRun(
      startedAt,
      {
        source: "otomoto",
        fetched: 0,
        offersUpserted: 0,
        newOffers: 0,
        priceChanges: 0,
        disappeared: 0,
        snapshotsCreated: 0,
        dealPushNotificationsSent: 0,
      },
      "error",
      error instanceof Error ? error.message : "Cayenne collector failed.",
    );
    throw error;
  }
}

export async function setCayenneWatchlistStatus(
  id: string,
  isWatchlisted: boolean,
): Promise<{ id: string; isWatchlisted: boolean } | null> {
  await connectToDatabase();

  if (!Types.ObjectId.isValid(id)) {
    return null;
  }

  const offer = await CayenneOffer.findByIdAndUpdate(
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

export async function storeCayenneOffers(
  normalizedOffers: NormalizedCayenneOffer[],
  fetchedAt: Date,
): Promise<CayenneCollectorRunResult> {
  const result: CayenneCollectorRunResult = {
    source: "otomoto",
    fetched: normalizedOffers.length,
    offersUpserted: normalizedOffers.length,
    newOffers: 0,
    priceChanges: 0,
    disappeared: 0,
    snapshotsCreated: 0,
  };

  if (normalizedOffers.length === 0) {
    return result;
  }

  const externalIds = normalizedOffers.map((offer) => offer.externalId);
  const existingOffers = (await CayenneOffer.find(
    { source: "otomoto", externalId: { $in: externalIds } },
    { externalId: 1, price: 1, currency: 1, imageUrls: 1, firstSeenAt: 1 },
  ).lean()) as Array<{
    _id: Types.ObjectId;
    externalId: string;
    price: number;
    currency?: string | null;
    imageUrls?: string[] | null;
    firstSeenAt: Date;
  }>;
  const existingByExternalId = new Map(
    existingOffers.map((offer) => [offer.externalId, offer]),
  );

  result.newOffers = normalizedOffers.filter(
    (offer) => !existingByExternalId.has(offer.externalId),
  ).length;
  result.priceChanges = normalizedOffers.filter((offer) => {
    const existing = existingByExternalId.get(offer.externalId);
    return Boolean(existing && existing.price !== offer.price);
  }).length;

  await CayenneOffer.bulkWrite(
    normalizedOffers.map((offer) => {
      const existing = existingByExternalId.get(offer.externalId);
      const imageUrls = mergeStringValues(
        [offer.imageUrl, ...offer.imageUrls],
        existing?.imageUrls,
      );

      return {
        updateOne: {
          filter: { source: offer.source, externalId: offer.externalId },
          update: {
            $set: {
              title: offer.title,
              offerUrl: offer.offerUrl,
              imageUrl: imageUrls[0],
              imageUrls,
              price: offer.price,
              currency: offer.currency,
              year: offer.year,
              mileageKm: offer.mileageKm,
              fuelType: offer.fuelType,
              transmission: offer.transmission,
              enginePowerHp: offer.enginePowerHp,
              engineSizeCc: offer.engineSizeCc,
              location: offer.location,
              region: offer.region,
              sellerType: offer.sellerType,
              sellerName: offer.sellerName,
              hasVatInvoice: offer.hasVatInvoice,
              hasFinancing: offer.hasFinancing,
              isAccidentFree: offer.isAccidentFree,
              isDamaged: offer.isDamaged,
              isImportOffer: offer.isImportOffer,
              importReason: offer.importReason,
              hasDealRisk: offer.hasDealRisk,
              dealRiskReason: offer.dealRiskReason,
              postedAt: offer.postedAt,
              lastSeenAt: fetchedAt,
              isAvailable: true,
              unavailableSince: null,
              rawData: offer.rawData,
            },
            $setOnInsert: {
              source: offer.source,
              externalId: offer.externalId,
              firstSeenAt: fetchedAt,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  const storedOffers = await CayenneOffer.find(
    { source: "otomoto", externalId: { $in: externalIds } },
    { _id: 1, externalId: 1 },
  ).lean();
  const storedOfferByExternalId = new Map(
    storedOffers.map((offer) => [offer.externalId, offer]),
  );
  const latestSnapshots = await getLatestSnapshots(
    storedOffers.map((offer) => offer._id),
  );
  const snapshots = [];

  for (const offer of normalizedOffers) {
    const storedOffer = storedOfferByExternalId.get(offer.externalId);

    if (!storedOffer) {
      continue;
    }

    const latestSnapshot = latestSnapshots.get(String(storedOffer._id));

    if (!shouldCreateCayennePriceSnapshot(latestSnapshot, offer)) {
      continue;
    }

    snapshots.push({
      offerId: storedOffer._id,
      fetchedAt,
      price: offer.price,
      currency: offer.currency,
      rawData: offer.rawData,
    });
  }

  if (snapshots.length > 0) {
    await CayennePriceSnapshot.insertMany(snapshots, { ordered: false });
    result.snapshotsCreated = snapshots.length;
  }

  const unavailableResult = await CayenneOffer.updateMany(
    {
      source: "otomoto",
      externalId: { $nin: externalIds },
      isAvailable: { $ne: false },
    },
    {
      $set: {
        isAvailable: false,
        unavailableSince: fetchedAt,
      },
    },
  );
  result.disappeared = unavailableResult.modifiedCount;

  return result;
}

async function getPriceHistories(
  offerIds: Types.ObjectId[],
): Promise<Map<string, CayennePriceSnapshotView[]>> {
  const histories = new Map<string, CayennePriceSnapshotView[]>();

  if (offerIds.length === 0) {
    return histories;
  }

  const snapshots = await CayennePriceSnapshot.find({
    offerId: { $in: offerIds },
  })
    .sort({ fetchedAt: 1 })
    .lean();

  for (const snapshot of snapshots) {
    const offerId = String(snapshot.offerId);
    const history = histories.get(offerId) || [];
    history.push({
      id: String(snapshot._id),
      fetchedAt: snapshot.fetchedAt.toISOString(),
      price: snapshot.price,
      currency: snapshot.currency || "PLN",
    });
    histories.set(offerId, history);
  }

  return histories;
}

async function getLatestSnapshots(
  offerIds: Types.ObjectId[],
): Promise<Map<string, { price: number; currency: string }>> {
  const snapshotsByOfferId = new Map<string, { price: number; currency: string }>();

  if (offerIds.length === 0) {
    return snapshotsByOfferId;
  }

  const snapshots = await CayennePriceSnapshot.find({
    offerId: { $in: offerIds },
  })
    .sort({ offerId: 1, fetchedAt: -1 })
    .lean();

  for (const snapshot of snapshots) {
    const offerId = String(snapshot.offerId);

    if (!snapshotsByOfferId.has(offerId)) {
      snapshotsByOfferId.set(offerId, {
        price: snapshot.price,
        currency: snapshot.currency || "PLN",
      });
    }
  }

  return snapshotsByOfferId;
}

async function recordCollectorRun(
  startedAt: Date,
  result: CayenneCollectorRunResult,
  status: "success" | "error",
  message?: string,
) {
  await CayenneCollectorRun.create({
    source: result.source,
    status,
    startedAt,
    finishedAt: new Date(),
    fetched: result.fetched,
    offersUpserted: result.offersUpserted,
    newOffers: result.newOffers,
    priceChanges: result.priceChanges,
    disappeared: result.disappeared,
    snapshotsCreated: result.snapshotsCreated,
    dealPushNotificationsSent: result.dealPushNotificationsSent || 0,
    message,
  });
}

function sortCayenneOffers(
  offers: CayenneSearchResult["offers"],
  sort: CayenneSort,
): CayenneSearchResult["offers"] {
  return [...offers].sort((left, right) => {
    if (sort === "priceAsc") {
      return left.price - right.price;
    }

    if (sort === "priceDesc") {
      return right.price - left.price;
    }

    if (sort === "deltaAsc") {
      return compareCayennePriceDelta(left, right, "asc");
    }

    if (sort === "deltaDesc") {
      return compareCayennePriceDelta(left, right, "desc");
    }

    if (sort === "yearDesc") {
      return (right.year || 0) - (left.year || 0);
    }

    if (sort === "dealScoreDesc") {
      return (right.dealScore?.score || 0) - (left.dealScore?.score || 0);
    }

    const firstSeenDelta =
      new Date(right.firstSeenAt).getTime() -
      new Date(left.firstSeenAt).getTime();

    if (firstSeenDelta !== 0) {
      return firstSeenDelta;
    }

    return right.price - left.price;
  });
}

function compareCayennePriceDelta(
  left: CayenneSearchResult["offers"][number],
  right: CayenneSearchResult["offers"][number],
  direction: "asc" | "desc",
): number {
  const leftDelta = left.priceDelta?.amount;
  const rightDelta = right.priceDelta?.amount;

  if (leftDelta === undefined && rightDelta === undefined) return 0;
  if (leftDelta === undefined) return 1;
  if (rightDelta === undefined) return -1;

  return direction === "asc" ? leftDelta - rightDelta : rightDelta - leftDelta;
}

function mergeStringValues(
  primary?: Array<string | null | undefined> | null,
  secondary?: Array<string | null | undefined> | null,
): string[] {
  return Array.from(
    new Set([...(primary || []), ...(secondary || [])].filter(Boolean)),
  ) as string[];
}
