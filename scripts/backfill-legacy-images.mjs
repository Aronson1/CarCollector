import mongoose from "mongoose";

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/carCollectorDB";
const portalId = process.env.ARVAL_PORTAL_ID || "17";
const pointOfSaleIds = (process.env.ARVAL_POINT_OF_SALE_IDS || "942,958")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const concurrency = Number(process.env.IMAGE_BACKFILL_CONCURRENCY || 16);
const requestTimeoutMs = Number(process.env.IMAGE_BACKFILL_TIMEOUT_MS || 4000);

await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });

const db = mongoose.connection.db;
const offers = await db
  .collection("caroffers")
  .find(
    {
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: null },
        { imageUrl: "" },
      ],
    },
    { projection: { _id: 1, externalId: 1 } },
  )
  .toArray();

const stats = {
  checked: offers.length,
  updated: 0,
  missing: 0,
};

let index = 0;

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (index < offers.length) {
      const offer = offers[index++];
      const imageUrl = await findImageUrl(offer.externalId);

      if (!imageUrl) {
        stats.missing += 1;
        continue;
      }

      await db
        .collection("caroffers")
        .updateOne({ _id: offer._id }, { $set: { imageUrl } });
      stats.updated += 1;
    }
  }),
);

console.log(JSON.stringify(stats, null, 2));

await mongoose.disconnect();

async function findImageUrl(externalId) {
  for (const pointOfSaleId of pointOfSaleIds) {
    const url = `https://arvalprodeuwsa.blob.core.windows.net/arval-prod-euw-blobcontainer-images/PortalsAnnouncementsMainImages/${portalId}/${pointOfSaleId}/${externalId}/0.jpeg`;
    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (response.ok) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
