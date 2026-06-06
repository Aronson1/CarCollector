import { connectToDatabase } from "../db";
import { CarOffer, CollectorRun, PriceSnapshot } from "../models/car";
import {
  pricesEqual,
  normalizeArvalAnnouncement,
  normalizeArvalNewCarOffer,
} from "../prices";
import {
  fetchArvalAnnouncementDetailsById,
  fetchArvalAnnouncements,
} from "../sources/arval";
import { fetchArvalNewCarOffers } from "../sources/arval-new";
import type { ArvalAnnouncement, CarDetails, PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";
import { sendUsedRentalDealPushNotifications } from "./push-notifications";

export type CollectorPurchaseOption = PurchaseOption | "all";

export interface CollectorRunResult {
  purchaseOption: CollectorPurchaseOption;
  fetched: number;
  offersUpserted: number;
  snapshotsCreated: number;
  skippedUnchanged: number;
  dealPushNotificationsSent?: number;
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
        await sendUsedRentalDealPushNotifications();
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
      : (
          await fetchArvalAnnouncements({
            includeDetails: purchaseOption === "sale",
            purchaseOption,
          })
        ).map((announcement) =>
          normalizeArvalAnnouncement(announcement, purchaseOption),
        );
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

  await CarOffer.bulkWrite(
    normalizedOffers.map((normalized) => {
      const existing = existingOfferEnrichment.get(normalized.externalId);
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
  const offerByExternalId = new Map(
    offers.map((offer) => [offer.externalId, offer]),
  );

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

interface ExistingOfferEnrichment {
  imageUrls: string[];
  equipmentItems: string[];
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
