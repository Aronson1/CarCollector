import { connectToDatabase } from "../db";
import { CarOffer, CollectorRun, PriceSnapshot } from "../models/car";
import {
  pricesEqual,
  normalizeArvalAnnouncement,
  normalizeArvalNewCarOffer,
} from "../prices";
import { fetchArvalAnnouncements } from "../sources/arval";
import { fetchArvalNewCarOffers } from "../sources/arval-new";
import type { PurchaseOption } from "../types";
import { ensurePurchaseOptionMigration } from "./migrations";

export type CollectorPurchaseOption = PurchaseOption | "all";

export interface CollectorRunResult {
  purchaseOption: CollectorPurchaseOption;
  fetched: number;
  offersUpserted: number;
  snapshotsCreated: number;
  skippedUnchanged: number;
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

  const normalizedOffers = (
    await fetchArvalAnnouncements({ pageNumber, pageSize, purchaseOption })
  ).map((announcement) =>
    normalizeArvalAnnouncement(announcement, purchaseOption),
  );

  const result: ImageBackfillResult = {
    purchaseOption,
    pageNumber,
    pageSize,
    fetched: normalizedOffers.length,
    matched: 0,
    modified: 0,
    manyImages: normalizedOffers.filter((offer) => offer.imageUrls.length > 1)
      .length,
    hasMore: normalizedOffers.length === pageSize,
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
      : (await fetchArvalAnnouncements({ purchaseOption })).map(
          (announcement) =>
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

  await CarOffer.bulkWrite(
    normalizedOffers.map((normalized) => ({
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
            imageUrl: normalized.imageUrl,
            imageUrls: normalized.imageUrls,
            fullName: normalized.fullName,
            brand: normalized.brand,
            model: normalized.model,
            firstRegistrationDate: normalized.firstRegistrationDate,
            registrationNumber: normalized.registrationNumber,
            labelCode: normalized.labelCode,
            details: normalized.details,
            rawCreatedAt: normalized.rawCreatedAt,
            rawUpdatedAt: normalized.rawUpdatedAt,
            rawData: normalized.rawData,
          },
          $setOnInsert: {
            source: normalized.source,
            externalId: normalized.externalId,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const externalIds = normalizedOffers.map((offer) => offer.externalId);
  const offers = await CarOffer.find(
    { source: "arval", purchaseOption, externalId: { $in: externalIds } },
    { _id: 1, externalId: 1 },
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
              rawData: normalized.rawData,
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
      rawData: normalized.rawData,
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
    message,
  });
}

function sumRuns(
  runs: CollectorRunResult[],
  key: "fetched" | "offersUpserted" | "snapshotsCreated" | "skippedUnchanged",
): number {
  return runs.reduce((total, run) => total + run[key], 0);
}
