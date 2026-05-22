import mongoose, { Schema } from "mongoose";
import fs from "node:fs/promises";

const legacyUri =
  process.env.LEGACY_MONGODB_URI || "mongodb://127.0.0.1:27017/carCollectorDB";
const targetUri = process.env.MONGODB_URI;
const legacyCarsJson = process.env.LEGACY_CARS_JSON;

if (!targetUri) {
  console.error("MONGODB_URI is required for the target database.");
  process.exit(1);
}

const legacyConnection = legacyCarsJson
  ? null
  : await mongoose.createConnection(legacyUri).asPromise();
const targetConnection = await mongoose.createConnection(targetUri).asPromise();

const legacyCarSchema = new Schema({}, { collection: "cars", strict: false });
const LegacyCar = legacyConnection?.model("LegacyCar", legacyCarSchema);

const detailsSchema = new Schema(
  {
    mileage: Number,
    registrationYear: Number,
    fuelTypeLabel: String,
    gearbox: String,
    warrantyMonths: Number,
  },
  { _id: false },
);

const carOfferSchema = new Schema(
  {
    source: { type: String, required: true, enum: ["arval"], index: true },
    externalId: { type: String, required: true, index: true },
    offerUrl: String,
    imageUrl: String,
    fullName: { type: String, required: true },
    brand: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    firstRegistrationDate: String,
    registrationNumber: String,
    labelCode: String,
    details: { type: detailsSchema, default: {} },
    rawCreatedAt: Date,
    rawUpdatedAt: Date,
    rawData: Schema.Types.Mixed,
  },
  { timestamps: true },
);
carOfferSchema.index({ source: 1, externalId: 1 }, { unique: true });

const priceSnapshotSchema = new Schema(
  {
    offerId: { type: Schema.Types.ObjectId, ref: "CarOffer", required: true, index: true },
    fetchedAt: { type: Date, required: true, index: true },
    rawUpdatedAt: Date,
    prices: { type: [Number], required: true },
    rawData: Schema.Types.Mixed,
  },
  { timestamps: true },
);

const CarOffer = targetConnection.model("CarOffer", carOfferSchema);
const PriceSnapshot = targetConnection.model("PriceSnapshot", priceSnapshotSchema);

await CarOffer.init();
await PriceSnapshot.init();

const stats = {
  legacyRows: 0,
  offersUpserted: 0,
  snapshotsCreated: 0,
  duplicatesSkipped: 0,
};

const legacyCars = legacyCarsJson
  ? await readLegacyCarsJson(legacyCarsJson)
  : LegacyCar.find().cursor();

for await (const legacyCar of legacyCars) {
  stats.legacyRows += 1;

  if (!legacyCar.id) {
    stats.duplicatesSkipped += 1;
    continue;
  }

  const externalId = String(legacyCar.id);
  const offer = await CarOffer.findOneAndUpdate(
    { source: "arval", externalId },
    {
      $set: {
        offerUrl: legacyCar.offerUrl,
        imageUrl: legacyCar.imageUrl,
        fullName: legacyCar.fullName || `${legacyCar.brand || "Unknown"} ${legacyCar.model || ""}`.trim(),
        brand: legacyCar.brand || "Unknown",
        model: legacyCar.model || "Unknown",
        firstRegistrationDate: legacyCar.firstRegistrationDate,
        registrationNumber: legacyCar.registrationNumber,
        labelCode: legacyCar.labelCode,
        details: legacyCar.details || {},
        rawCreatedAt: toDate(legacyCar.createdAt),
        rawUpdatedAt: toDate(legacyCar.updatedAt),
        rawData: legacyCar,
      },
      $setOnInsert: { source: "arval", externalId },
    },
    { returnDocument: "after", upsert: true },
  );

  stats.offersUpserted += 1;

  const fetchedAt =
    toDate(Array.isArray(legacyCar.timestamp) ? legacyCar.timestamp[0] : legacyCar.timestamp) ||
    toDate(legacyCar.createdAt) ||
    new Date();
  const prices = Array.isArray(legacyCar.price)
    ? legacyCar.price.map((price) => toFinitePrice(price))
    : [];

  const existingSnapshot = await PriceSnapshot.findOne({
    offerId: offer._id,
    fetchedAt,
    prices,
  }).lean();

  if (existingSnapshot) {
    await PriceSnapshot.updateOne(
      { _id: existingSnapshot._id },
      {
        $set: {
          rawUpdatedAt: toDate(legacyCar.updatedAt),
          rawData: legacyCar,
        },
      },
    );
    stats.duplicatesSkipped += 1;
    continue;
  }

  await PriceSnapshot.create({
    offerId: offer._id,
    fetchedAt,
    rawUpdatedAt: toDate(legacyCar.updatedAt),
    prices,
    rawData: legacyCar,
  });
  stats.snapshotsCreated += 1;
}

console.log(JSON.stringify(stats, null, 2));

await legacyConnection?.close();
await targetConnection.close();

function toDate(value) {
  if (!value) return undefined;
  if (value.$date) return toDate(value.$date);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toFinitePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

async function readLegacyCarsJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${filePath} to contain a JSON array.`);
  }

  return parsed;
}
