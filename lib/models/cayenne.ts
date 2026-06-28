import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const cayenneOfferSchema = new Schema(
  {
    source: { type: String, required: true, enum: ["otomoto"], index: true },
    externalId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    offerUrl: { type: String, required: true },
    imageUrl: String,
    imageUrls: { type: [String], default: [] },
    price: { type: Number, required: true, index: true },
    currency: { type: String, default: "PLN", index: true },
    year: { type: Number, index: true },
    mileageKm: Number,
    fuelType: String,
    transmission: String,
    enginePowerHp: Number,
    engineSizeCc: Number,
    location: String,
    region: String,
    sellerType: String,
    sellerName: String,
    hasVatInvoice: { type: Boolean, default: false, index: true },
    hasFinancing: { type: Boolean, default: false, index: true },
    isAccidentFree: { type: Boolean, index: true },
    isDamaged: { type: Boolean, default: false, index: true },
    isImportOffer: { type: Boolean, default: false, index: true },
    importReason: String,
    hasDealRisk: { type: Boolean, default: false, index: true },
    dealRiskReason: String,
    dealPushNotifiedAt: Date,
    dealPushNotifiedScore: Number,
    postedAt: Date,
    firstSeenAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, required: true, index: true },
    unavailableSince: Date,
    isAvailable: { type: Boolean, default: true, index: true },
    isWatchlisted: { type: Boolean, default: false, index: true },
    rawData: Schema.Types.Mixed,
  },
  { timestamps: true },
);

cayenneOfferSchema.index({ source: 1, externalId: 1 }, { unique: true });

const cayennePriceSnapshotSchema = new Schema(
  {
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "CayenneOffer",
      required: true,
      index: true,
    },
    fetchedAt: { type: Date, required: true, index: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "PLN" },
    rawData: Schema.Types.Mixed,
  },
  { timestamps: true },
);

cayennePriceSnapshotSchema.index({ offerId: 1, fetchedAt: 1 });

const cayenneCollectorRunSchema = new Schema(
  {
    source: { type: String, required: true, enum: ["otomoto"], index: true },
    status: {
      type: String,
      required: true,
      enum: ["success", "error"],
      index: true,
    },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, required: true, index: true },
    fetched: { type: Number, default: 0 },
    offersUpserted: { type: Number, default: 0 },
    newOffers: { type: Number, default: 0 },
    priceChanges: { type: Number, default: 0 },
    disappeared: { type: Number, default: 0 },
    snapshotsCreated: { type: Number, default: 0 },
    dealPushNotificationsSent: { type: Number, default: 0 },
    message: String,
  },
  { timestamps: true },
);

cayenneCollectorRunSchema.index({ source: 1, finishedAt: -1 });

export type CayenneOfferDocument = InferSchemaType<typeof cayenneOfferSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type CayennePriceSnapshotDocument = InferSchemaType<
  typeof cayennePriceSnapshotSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export type CayenneCollectorRunDocument = InferSchemaType<
  typeof cayenneCollectorRunSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const CayenneOffer =
  (mongoose.models.CayenneOffer as Model<CayenneOfferDocument>) ||
  mongoose.model<CayenneOfferDocument>("CayenneOffer", cayenneOfferSchema);

export const CayennePriceSnapshot =
  (mongoose.models.CayennePriceSnapshot as Model<CayennePriceSnapshotDocument>) ||
  mongoose.model<CayennePriceSnapshotDocument>(
    "CayennePriceSnapshot",
    cayennePriceSnapshotSchema,
  );

export const CayenneCollectorRun =
  (mongoose.models.CayenneCollectorRun as Model<CayenneCollectorRunDocument>) ||
  mongoose.model<CayenneCollectorRunDocument>(
    "CayenneCollectorRun",
    cayenneCollectorRunSchema,
  );
