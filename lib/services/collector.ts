import { connectToDatabase } from "../db";
import {
  AvailabilityEvent,
  CarOffer,
  CollectorRun,
  PriceSnapshot,
} from "../models/car";
import {
  getSeenAvailabilityUpdate,
  shouldRecordDisappearance,
} from "../availability";
import {
  pricesEqual,
  normalizeArvalAnnouncement,
  normalizeArvalNewCarOffer,
  normalizeArvalPowerHp,
} from "../prices";
import {
  fetchArvalAnnouncementDetailsById,
  fetchArvalAnnouncements,
} from "../sources/arval";
import { fetchArvalNewCarOffers } from "../sources/arval-new";
import type { ArvalAnnouncement, CarDetails, PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";
import { sendUsedRentalDealPushNotifications } from "./push-notifications";
import type { Types } from "mongoose";

export type CollectorPurchaseOption = PurchaseOption | "all";

export interface CollectorRunResult {
  purchaseOption: CollectorPurchaseOption;
  fetched: number;
  offersUpserted: number;
  snapshotsCreated: number;
  skippedUnchanged: number;
  availabilityEventsCreated?: number;
  offersMarkedUnavailable?: number;
  dealPushNotificationsSent?: number;
  newOfferIds?: string[];
  runs?: CollectorRunResult[];
}

export interface ImageBackfillResult {
  purchaseOption: Exclude<PurchaseOption, "newRelease">;
  pageNumber: number;
  pageSize: number;
  fetched: number;
  matched: number;
  modified: number;
  manyImages: number;
  withEquipment: number;
  hasMore: boolean;
}

export interface PowerBackfillResult {
  purchaseOption: Exclude<PurchaseOption, "newRelease">;
  pageNumber: number;
  pageSize: number;
  fetched: number;
  updated: number;
  fromStoredData: number;
  fromArvalDetails: number;
  unavailable: number;
  missingPower: number;
  failed: number;
  hasMore: boolean;
}

const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

export async function backfillOfferImages(
  purchaseOption: Exclude<PurchaseOption, "newRelease">,
  pageNumber = 1,
  pageSize = 30,
): Promise<ImageBackfillResult> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  const offers = await CarOffer.find(
    { source: "arval", purchaseOption },
    { externalId: 1, imageUrl: 1, rawData: 1 },
  )
    .sort({ rawCreatedAt: -1, createdAt: -1, _id: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize)
    .lean();

  const normalizedOffers = await mapWithConcurrency(
    offers,
    8,
    async (offer) => {
      const rawData = isArvalAnnouncement(offer.rawData)
        ? offer.rawData
        : ({ id: offer.externalId } as ArvalAnnouncement);

      try {
        const details = await fetchArvalAnnouncementDetailsById(offer.externalId);
        return normalizeArvalAnnouncement(
          mergeImageDetails(
            rawData,
            details,
            offer.externalId,
            offer.imageUrl || undefined,
          ),
          purchaseOption,
        );
      } catch {
        return normalizeArvalAnnouncement(rawData, purchaseOption);
      }
    },
  );

  const result: ImageBackfillResult = {
    purchaseOption,
    pageNumber,
    pageSize,
    fetched: offers.length,
    matched: 0,
    modified: 0,
    manyImages: normalizedOffers.filter((offer) => offer.imageUrls.length > 1)
      .length,
    withEquipment: normalizedOffers.filter(
      (offer) => offer.equipmentItems.length > 0,
    ).length,
    hasMore: offers.length === pageSize,
  };

  if (normalizedOffers.length === 0) {
    return result;
  }

  const writeResult = await CarOffer.bulkWrite(
    normalizedOffers.map((normalized) => ({
      updateOne: {
        filter: {
          source: normalized.source,
          purchaseOption: normalized.purchaseOption,
          externalId: normalized.externalId,
        },
        update: {
          $set: {
            imageUrl: normalized.imageUrl,
            imageUrls: normalized.imageUrls,
            equipmentItems: normalized.equipmentItems,
          },
        },
      },
    })),
    { ordered: false },
  );

  result.matched = writeResult.matchedCount;
  result.modified = writeResult.modifiedCount;
  return result;
}

export async function backfillOfferPower(
  purchaseOption: Exclude<PurchaseOption, "newRelease">,
  pageNumber = 1,
  pageSize = 30,
): Promise<PowerBackfillResult> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  const offers = await CarOffer.find(
    {
      source: "arval",
      purchaseOption,
      $or: [
        { "details.powerHp": { $exists: false } },
        { "details.powerHp": null },
      ],
    },
    { externalId: 1, rawData: 1 },
  )
    .sort({ rawCreatedAt: -1, createdAt: -1, _id: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize)
    .lean();

  const result: PowerBackfillResult = {
    purchaseOption,
    pageNumber,
    pageSize,
    fetched: offers.length,
    updated: 0,
    fromStoredData: 0,
    fromArvalDetails: 0,
    unavailable: 0,
    missingPower: 0,
    failed: 0,
    hasMore: offers.length === pageSize,
  };

  await mapWithConcurrency(offers, 8, async (offer) => {
    try {
      const storedPowerHp = isArvalAnnouncement(offer.rawData)
        ? normalizeArvalPowerHp(offer.rawData)
        : undefined;

      if (storedPowerHp) {
        await updateOfferPower(offer._id, storedPowerHp, offer.rawData);
        result.updated += 1;
        result.fromStoredData += 1;
        return;
      }

      const details = await fetchArvalAnnouncementDetailsById(offer.externalId);
      const powerHp = normalizeArvalPowerHp(details);

      if (!powerHp) {
        result.missingPower += 1;
        return;
      }

      await updateOfferPower(
        offer._id,
        powerHp,
        mergeRawData(details, offer.rawData),
      );
      result.updated += 1;
      result.fromArvalDetails += 1;
    } catch {
      result.failed += 1;
    }
  });

  return result;
}

async function updateOfferPower(
  id: Types.ObjectId,
  powerHp: number,
  rawData: unknown,
) {
  await CarOffer.updateOne(
    { _id: id },
    {
      $set: {
        "details.powerHp": powerHp,
        rawData,
      },
    },
  );
}

function isArvalAnnouncement(value: unknown): value is ArvalAnnouncement {
  return Boolean(value && typeof value === "object" && "id" in value);
}

function mergeImageDetails(
  announcement: ArvalAnnouncement,
  details: ArvalAnnouncement,
  externalId: string,
  fallbackImageUrl?: string,
): ArvalAnnouncement {
  return {
    ...details,
    ...announcement,
    id: announcement.id || externalId,
    horsePower: announcement.horsePower ?? details.horsePower,
    power: announcement.power ?? details.power,
    images:
      details.images && details.images.length > 0
        ? details.images
        : announcement.images,
    mainImage: announcement.mainImage || details.mainImage || fallbackImageUrl,
    mainUrl: announcement.mainUrl || details.mainUrl,
    equipments:
      details.equipments && details.equipments.length > 0
        ? details.equipments
        : announcement.equipments,
  };
}

export async function runCollector(
  purchaseOption: CollectorPurchaseOption = "all",
): Promise<CollectorRunResult> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  if (purchaseOption === "all") {
    const startedAt = new Date();

    try {
      const runs = await Promise.all(
        purchaseOptions.map((option) => runCollectorForPurchaseOption(option)),
      );
      const result = {
        purchaseOption,
        fetched: sumRuns(runs, "fetched"),
        offersUpserted: sumRuns(runs, "offersUpserted"),
        snapshotsCreated: sumRuns(runs, "snapshotsCreated"),
        skippedUnchanged: sumRuns(runs, "skippedUnchanged"),
        availabilityEventsCreated: sumRuns(runs, "availabilityEventsCreated"),
        offersMarkedUnavailable: sumRuns(runs, "offersMarkedUnavailable"),
        dealPushNotificationsSent: sumRuns(runs, "dealPushNotificationsSent"),
        runs,
      };

      await recordCollectorRun(startedAt, result, "success");
      return result;
    } catch (error) {
      await recordCollectorRun(startedAt, {
        purchaseOption,
        fetched: 0,
        offersUpserted: 0,
        snapshotsCreated: 0,
        skippedUnchanged: 0,
      }, "error", error instanceof Error ? error.message : "Collector run failed.");
      throw error;
    }
  }

  return runCollectorForPurchaseOption(purchaseOption);
}

async function runCollectorForPurchaseOption(
  purchaseOption: PurchaseOption,
): Promise<CollectorRunResult> {
  const startedAt = new Date();

  try {
    const result = await collectPurchaseOption(purchaseOption);
    if (purchaseOption === "release") {
      result.dealPushNotificationsSent =
        await sendUsedRentalDealPushNotifications({
          offerIds: result.newOfferIds || [],
        });
    }
    await recordCollectorRun(startedAt, result, "success");
    return result;
  } catch (error) {
    await recordCollectorRun(startedAt, {
      purchaseOption,
      fetched: 0,
      offersUpserted: 0,
      snapshotsCreated: 0,
      skippedUnchanged: 0,
    }, "error", error instanceof Error ? error.message : "Collector run failed.");
    throw error;
  }
}

async function collectPurchaseOption(
  purchaseOption: PurchaseOption,
): Promise<CollectorRunResult> {
  const normalizedOffers =
    purchaseOption === "newRelease"
      ? (await fetchArvalNewCarOffers()).map((offer) =>
          normalizeArvalNewCarOffer(offer),
        )
      : await fetchAndNormalizeUsedArvalOffers(purchaseOption);
  const fetchedAt = new Date();
  const result: CollectorRunResult = {
    purchaseOption,
    fetched: normalizedOffers.length,
    offersUpserted: normalizedOffers.length,
    snapshotsCreated: 0,
    skippedUnchanged: 0,
  };

  if (normalizedOffers.length === 0) {
    return result;
  }

  const externalIds = normalizedOffers.map((offer) => offer.externalId);
  const existingOfferEnrichment = await getExistingOfferEnrichment(
    purchaseOption,
    externalIds,
  );
  const newExternalIds = new Set(
    normalizedOffers
      .filter((offer) => !existingOfferEnrichment.has(offer.externalId))
      .map((offer) => offer.externalId),
  );

  await CarOffer.bulkWrite(
    normalizedOffers.map((normalized) => {
      const existing = existingOfferEnrichment.get(normalized.externalId);
      const availabilityUpdate = getSeenAvailabilityUpdate(existing, fetchedAt);
      const imageUrls = mergeStringValues(
        [normalized.imageUrl, ...normalized.imageUrls],
        existing?.imageUrls,
      );
      const equipmentItems = mergeStringValues(
        normalized.equipmentItems,
        existing?.equipmentItems,
      );
      const details = mergeDetails(normalized.details, existing?.details);
      const rawData = mergeRawData(normalized.rawData, existing?.rawData);

      return {
        updateOne: {
          filter: {
            source: normalized.source,
            purchaseOption: normalized.purchaseOption,
            externalId: normalized.externalId,
          },
          update: {
            $set: {
              purchaseOption: normalized.purchaseOption,
              offerUrl: normalized.offerUrl,
              imageUrl: imageUrls[0],
              imageUrls,
              equipmentItems,
              fullName: normalized.fullName,
              brand: normalized.brand,
              model: normalized.model,
              firstRegistrationDate: normalized.firstRegistrationDate,
              registrationNumber: normalized.registrationNumber,
              labelCode: normalized.labelCode,
              isAvailable: availabilityUpdate.isAvailable,
              availableSince: availabilityUpdate.availableSince,
              unavailableSince: availabilityUpdate.unavailableSince,
              lastSeenAt: availabilityUpdate.lastSeenAt,
              lastAvailabilityChangeAt:
                availabilityUpdate.lastAvailabilityChangeAt,
              details,
              rawCreatedAt: normalized.rawCreatedAt,
              rawUpdatedAt: normalized.rawUpdatedAt,
              rawData,
            },
            $setOnInsert: {
              source: normalized.source,
              externalId: normalized.externalId,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  const offers = await CarOffer.find(
    { source: "arval", purchaseOption, externalId: { $in: externalIds } },
    { _id: 1, externalId: 1, rawData: 1 },
  ).lean();
  result.newOfferIds = offers
    .filter((offer) => newExternalIds.has(offer.externalId))
    .map((offer) => String(offer._id));
  const offerByExternalId = new Map(
    offers.map((offer) => [offer.externalId, offer]),
  );
  const availabilityEvents = offers
    .map((offer) => {
      const existing = existingOfferEnrichment.get(offer.externalId);
      const eventType = getSeenAvailabilityUpdate(existing, fetchedAt).eventType;

      if (!eventType) {
        return null;
      }

      return {
        offerId: offer._id,
        purchaseOption,
        eventType,
        status: "available",
        eventAt: fetchedAt,
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  if (availabilityEvents.length > 0) {
    await AvailabilityEvent.insertMany(availabilityEvents, { ordered: false });
    result.availabilityEventsCreated =
      (result.availabilityEventsCreated || 0) + availabilityEvents.length;
  }

  const unavailableResult = await markMissingOffersUnavailable(
    purchaseOption,
    externalIds,
    fetchedAt,
  );
  result.offersMarkedUnavailable = unavailableResult.offersMarkedUnavailable;
  result.availabilityEventsCreated =
    (result.availabilityEventsCreated || 0) +
    unavailableResult.availabilityEventsCreated;

  const previousSnapshots = await PriceSnapshot.find({
    offerId: { $in: offers.map((offer) => offer._id) },
  })
    .sort({ fetchedAt: -1 })
    .lean();
  const latestSnapshotByOfferId = new Map<string, (typeof previousSnapshots)[number]>();

  for (const snapshot of previousSnapshots) {
    const offerId = String(snapshot.offerId);

    if (!latestSnapshotByOfferId.has(offerId)) {
      latestSnapshotByOfferId.set(offerId, snapshot);
    }
  }

  const unchangedSnapshotUpdates = [];
  const newSnapshots = [];

  for (const normalized of normalizedOffers) {
    const offer = offerByExternalId.get(normalized.externalId);

    if (!offer) {
      continue;
    }

    const previousSnapshot = latestSnapshotByOfferId.get(String(offer._id));

    if (
      previousSnapshot &&
      pricesEqual(previousSnapshot.prices, normalized.prices)
    ) {
      unchangedSnapshotUpdates.push({
        updateOne: {
          filter: { _id: previousSnapshot._id },
          update: {
            $set: {
              rawUpdatedAt: normalized.rawUpdatedAt,
              rawData: mergeRawData(normalized.rawData, previousSnapshot.rawData),
              purchaseOption: normalized.purchaseOption,
            },
          },
        },
      });
      result.skippedUnchanged += 1;
      continue;
    }

    newSnapshots.push({
      offerId: offer._id,
      purchaseOption: normalized.purchaseOption,
      fetchedAt,
      rawUpdatedAt: normalized.rawUpdatedAt,
      prices: normalized.prices,
      rawData: mergeRawData(normalized.rawData, offer.rawData),
    });
  }

  if (unchangedSnapshotUpdates.length > 0) {
    await PriceSnapshot.bulkWrite(unchangedSnapshotUpdates, { ordered: false });
  }

  if (newSnapshots.length > 0) {
    await PriceSnapshot.insertMany(newSnapshots, { ordered: false });
    result.snapshotsCreated = newSnapshots.length;
  }

  return result;
}

async function fetchAndNormalizeUsedArvalOffers(
  purchaseOption: Exclude<PurchaseOption, "newRelease">,
): Promise<ReturnType<typeof normalizeArvalAnnouncement>[]> {
  const announcements = await fetchArvalAnnouncements({
    includeDetails: false,
    purchaseOption,
  });
  const normalizedOffers = announcements.map((announcement) =>
    normalizeArvalAnnouncement(announcement, purchaseOption),
  );

  if (normalizedOffers.length === 0) {
    return normalizedOffers;
  }

  const existingOfferEnrichment = await getExistingOfferEnrichment(
    purchaseOption,
    normalizedOffers.map((offer) => offer.externalId),
  );
  const announcementByExternalId = new Map(
    announcements.map((announcement) => [String(announcement.id), announcement]),
  );
  const enrichedOffers = await mapWithConcurrency(
    normalizedOffers,
    8,
    async (offer) => {
      const existing = existingOfferEnrichment.get(offer.externalId);
      const needsGallery =
        mergeStringValues(
          [offer.imageUrl, ...offer.imageUrls],
          existing?.imageUrls,
        ).length <= 1;
      const needsPower = !offer.details.powerHp && !existing?.details?.powerHp;
      const needsEquipment =
        purchaseOption === "sale" &&
        mergeStringValues(offer.equipmentItems, existing?.equipmentItems)
          .length === 0;

      if (!needsGallery && !needsPower && !needsEquipment) {
        return offer;
      }

      const announcement = announcementByExternalId.get(offer.externalId);

      if (!announcement) {
        return offer;
      }

      try {
        const details = await fetchArvalAnnouncementDetailsById(offer.externalId);
        return normalizeArvalAnnouncement(
          mergeImageDetails(
            announcement,
            details,
            offer.externalId,
            offer.imageUrl,
          ),
          purchaseOption,
        );
      } catch {
        return offer;
      }
    },
  );

  return enrichedOffers;
}

interface ExistingOfferEnrichment {
  imageUrls: string[];
  equipmentItems: string[];
  isAvailable?: boolean | null;
  availableSince?: Date | null;
  lastAvailabilityChangeAt?: Date | null;
  details?: {
    powerHp?: number | null;
  };
  rawData?: unknown;
}

async function getExistingOfferEnrichment(
  purchaseOption: PurchaseOption,
  externalIds: string[],
): Promise<Map<string, ExistingOfferEnrichment>> {
  const existingOffers = await CarOffer.find(
    { source: "arval", purchaseOption, externalId: { $in: externalIds } },
    {
      externalId: 1,
      imageUrl: 1,
      imageUrls: 1,
      equipmentItems: 1,
      isAvailable: 1,
      availableSince: 1,
      lastAvailabilityChangeAt: 1,
      details: 1,
      rawData: 1,
    },
  ).lean();

  return new Map(
    existingOffers.map((offer) => [
      offer.externalId,
      {
        imageUrls: mergeStringValues([offer.imageUrl], offer.imageUrls),
        equipmentItems: mergeStringValues(offer.equipmentItems),
        isAvailable: offer.isAvailable,
        availableSince: offer.availableSince,
        lastAvailabilityChangeAt: offer.lastAvailabilityChangeAt,
        details: offer.details || undefined,
        rawData: offer.rawData,
      },
    ]),
  );
}

function mergeDetails(
  normalized: CarDetails,
  existing?: {
    powerHp?: number | null;
  },
): CarDetails {
  return {
    ...normalized,
    powerHp: normalized.powerHp ?? existing?.powerHp ?? undefined,
  };
}

function mergeRawData(normalized: unknown, existing: unknown): unknown {
  if (
    !normalized ||
    typeof normalized !== "object" ||
    !existing ||
    typeof existing !== "object"
  ) {
    return normalized;
  }

  const next = normalized as ArvalAnnouncement;
  const previous = existing as ArvalAnnouncement;

  return {
    ...previous,
    ...next,
    horsePower: next.horsePower ?? previous.horsePower,
    power: next.power ?? previous.power,
  };
}

function mergeStringValues(
  primary?: Array<string | null | undefined> | null,
  secondary?: Array<string | null | undefined> | null,
): string[] {
  return Array.from(
    new Set([...(primary || []), ...(secondary || [])].filter(Boolean)),
  ) as string[];
}

async function markMissingOffersUnavailable(
  purchaseOption: PurchaseOption,
  currentExternalIds: string[],
  eventAt: Date,
): Promise<{
  availabilityEventsCreated: number;
  offersMarkedUnavailable: number;
}> {
  const disappearedOffers = await CarOffer.find(
    {
      source: "arval",
      purchaseOption,
      externalId: { $nin: currentExternalIds },
      isAvailable: { $ne: false },
    },
    {
      _id: 1,
      purchaseOption: 1,
      isAvailable: 1,
      availableSince: 1,
      lastAvailabilityChangeAt: 1,
    },
  ).lean();
  const offersToMark = disappearedOffers.filter(shouldRecordDisappearance);

  if (offersToMark.length === 0) {
    return { availabilityEventsCreated: 0, offersMarkedUnavailable: 0 };
  }

  await CarOffer.updateMany(
    { _id: { $in: offersToMark.map((offer) => offer._id) } },
    {
      $set: {
        isAvailable: false,
        unavailableSince: eventAt,
        lastAvailabilityChangeAt: eventAt,
      },
    },
  );
  await AvailabilityEvent.insertMany(
    offersToMark.map((offer) => ({
      offerId: offer._id,
      purchaseOption,
      eventType: "disappeared",
      status: "unavailable",
      eventAt,
    })),
    { ordered: false },
  );

  return {
    availabilityEventsCreated: offersToMark.length,
    offersMarkedUnavailable: offersToMark.length,
  };
}

async function recordCollectorRun(
  startedAt: Date,
  result: CollectorRunResult,
  status: "success" | "error",
  message?: string,
) {
  await CollectorRun.create({
    purchaseOption: result.purchaseOption,
    status,
    startedAt,
    finishedAt: new Date(),
    fetched: result.fetched,
    offersUpserted: result.offersUpserted,
    snapshotsCreated: result.snapshotsCreated,
    skippedUnchanged: result.skippedUnchanged,
    availabilityEventsCreated: result.availabilityEventsCreated || 0,
    offersMarkedUnavailable: result.offersMarkedUnavailable || 0,
    dealPushNotificationsSent: result.dealPushNotificationsSent || 0,
    message,
  });
}

function sumRuns(
  runs: CollectorRunResult[],
  key:
    | "fetched"
    | "offersUpserted"
    | "snapshotsCreated"
    | "skippedUnchanged"
    | "availabilityEventsCreated"
    | "offersMarkedUnavailable"
    | "dealPushNotificationsSent",
): number {
  return runs.reduce((total, run) => total + (run[key] || 0), 0);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
