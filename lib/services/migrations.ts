import { CarOffer, PriceSnapshot } from "../models/car";

const legacyOfferIndexName = "source_1_externalId_1";
const purchaseOptionOfferIndexName =
  "source_1_purchaseOption_1_externalId_1";

let purchaseOptionMigrationPromise: Promise<void> | null = null;

export async function ensurePurchaseOptionMigration(): Promise<void> {
  purchaseOptionMigrationPromise ??= runPurchaseOptionMigration();

  try {
    await purchaseOptionMigrationPromise;
  } catch (error) {
    purchaseOptionMigrationPromise = null;
    throw error;
  }
}

async function runPurchaseOptionMigration() {
  await Promise.all([
    CarOffer.updateMany(
      { purchaseOption: { $exists: false } },
      { $set: { purchaseOption: "release" } },
    ),
    PriceSnapshot.updateMany(
      { purchaseOption: { $exists: false } },
      { $set: { purchaseOption: "release" } },
    ),
  ]);

  await CarOffer.collection.createIndex(
    { source: 1, purchaseOption: 1, externalId: 1 },
    { unique: true, name: purchaseOptionOfferIndexName },
  );

  const indexes = await CarOffer.collection.indexes();
  const hasLegacyOfferIndex = indexes.some(
    (index) => index.name === legacyOfferIndexName,
  );

  if (hasLegacyOfferIndex) {
    try {
      await CarOffer.collection.dropIndex(legacyOfferIndexName);
    } catch (error) {
      if (!isIndexNotFoundError(error)) {
        throw error;
      }
    }
  }
}

function isIndexNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "codeName" in error &&
    error.codeName === "IndexNotFound"
  );
}
