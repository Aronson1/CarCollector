import { connectToDatabase } from "../db";
import { CarOffer, PriceSnapshot } from "../models/car";
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

const purchaseOptions: PurchaseOption[] = ["release", "sale", "newRelease"];

export async function runCollector(
  purchaseOption: CollectorPurchaseOption = "all",
): Promise<CollectorRunResult> {
  await connectToDatabase();
  await ensurePurchaseOptionMigration();

  if (purchaseOption === "all") {
    const runs = await Promise.all(
      purchaseOptions.map((option) => runCollectorForPurchaseOption(option)),
    );

    return {
      purchaseOption,
      fetched: sumRuns(runs, "fetched"),
      offersUpserted: sumRuns(runs, "offersUpserted"),
      snapshotsCreated: sumRuns(runs, "snapshotsCreated"),
      skippedUnchanged: sumRuns(runs, "skippedUnchanged"),
      runs,
    };
  }

  return runCollectorForPurchaseOption(purchaseOption);
}

async function runCollectorForPurchaseOption(
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

function sumRuns(
  runs: CollectorRunResult[],
  key: "fetched" | "offersUpserted" | "snapshotsCreated" | "skippedUnchanged",
): number {
  return runs.reduce((total, run) => total + run[key], 0);
}
