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
  const fetchedAt = new Date();
  const result: CollectorRunResult = {
    fetched: announcements.length,
    offersUpserted: 0,
    snapshotsCreated: 0,
    skippedUnchanged: 0,
  };

  for (const announcement of announcements) {
    const normalized = normalizeArvalAnnouncement(announcement);

    const offer = await CarOffer.findOneAndUpdate(
      { source: normalized.source, externalId: normalized.externalId },
      {
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
      { returnDocument: "after", upsert: true },
    );

    result.offersUpserted += 1;

    const previousSnapshot = await PriceSnapshot.findOne({ offerId: offer._id })
      .sort({ fetchedAt: -1 })
      .lean();

    if (previousSnapshot && pricesEqual(previousSnapshot.prices, normalized.prices)) {
      await PriceSnapshot.updateOne(
        { _id: previousSnapshot._id },
        {
          $set: {
            rawUpdatedAt: normalized.rawUpdatedAt,
            rawData: normalized.rawData,
          },
        },
      );
      result.skippedUnchanged += 1;
      continue;
    }

    await PriceSnapshot.create({
      offerId: offer._id,
      fetchedAt,
      rawUpdatedAt: normalized.rawUpdatedAt,
      prices: normalized.prices,
      rawData: normalized.rawData,
    });
    result.snapshotsCreated += 1;
  }

  return result;
}
