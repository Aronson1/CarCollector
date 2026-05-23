import { connectToDatabase } from "../db";
import { CarOffer, PriceSnapshot } from "../models/car";
import { pricesEqual, normalizeArvalAnnouncement } from "../prices";
import { fetchArvalAnnouncements } from "../sources/arval";

export interface CollectorRunResult {
  fetched: number;
  offersUpserted: number;
  snapshotsCreated: number;
  skippedUnchanged: number;
}

export async function runCollector(): Promise<CollectorRunResult> {
  await connectToDatabase();

  const announcements = await fetchArvalAnnouncements();
  const normalizedOffers = announcements.map((announcement) =>
    normalizeArvalAnnouncement(announcement),
  );
  const fetchedAt = new Date();
  const result: CollectorRunResult = {
    fetched: announcements.length,
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
        filter: { source: normalized.source, externalId: normalized.externalId },
        update: {
          $set: {
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
    { source: "arval", externalId: { $in: externalIds } },
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
            },
          },
        },
      });
      result.skippedUnchanged += 1;
      continue;
    }

    newSnapshots.push({
      offerId: offer._id,
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
