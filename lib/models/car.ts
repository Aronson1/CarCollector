import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const carDetailsSchema = new Schema(
  {
    mileage: Number,
    annualMileage: Number,
    registrationYear: Number,
    fuelTypeLabel: String,
    gearbox: String,
    warrantyMonths: Number,
    contractMonths: Number,
    downPayment: Number,
    powerHp: Number,
  },
  { _id: false },
);

const carOfferSchema = new Schema(
  {
    source: { type: String, required: true, enum: ["arval"], index: true },
    purchaseOption: {
      type: String,
      required: true,
      enum: ["release", "sale", "newRelease"],
      default: "release",
      index: true,
    },
    externalId: { type: String, required: true, index: true },
    offerUrl: String,
    imageUrl: String,
    imageUrls: { type: [String], default: [] },
    equipmentItems: { type: [String], default: [] },
    fullName: { type: String, required: true },
    brand: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    firstRegistrationDate: String,
    registrationNumber: String,
    labelCode: String,
    isAvailable: { type: Boolean, default: true, index: true },
    availableSince: Date,
    unavailableSince: Date,
    lastSeenAt: Date,
    lastAvailabilityChangeAt: Date,
    isWatchlisted: { type: Boolean, default: false, index: true },
    details: { type: carDetailsSchema, default: {} },
    rawCreatedAt: Date,
    rawUpdatedAt: Date,
    rawData: Schema.Types.Mixed,
    dealPushNotifiedAt: Date,
    dealPushNotifiedScore: Number,
  },
  { timestamps: true },
);

carOfferSchema.index(
  { source: 1, purchaseOption: 1, externalId: 1 },
  { unique: true },
);

const priceSnapshotSchema = new Schema(
  {
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "CarOffer",
      required: true,
      index: true,
    },
    purchaseOption: {
      type: String,
      required: true,
      enum: ["release", "sale", "newRelease"],
      default: "release",
      index: true,
    },
    fetchedAt: { type: Date, required: true, index: true },
    rawUpdatedAt: Date,
    prices: { type: [Number], required: true },
    rawData: Schema.Types.Mixed,
  },
  { timestamps: true },
);

priceSnapshotSchema.index({ offerId: 1, fetchedAt: 1 });

const availabilityEventSchema = new Schema(
  {
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "CarOffer",
      required: true,
      index: true,
    },
    purchaseOption: {
      type: String,
      required: true,
      enum: ["release", "sale", "newRelease"],
      default: "release",
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ["firstSeen", "returned", "disappeared"],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["available", "unavailable"],
      index: true,
    },
    eventAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

availabilityEventSchema.index({ offerId: 1, eventAt: 1 });

const collectorRunSchema = new Schema(
  {
    purchaseOption: {
      type: String,
      required: true,
      enum: ["release", "sale", "newRelease", "all"],
      index: true,
    },
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
    snapshotsCreated: { type: Number, default: 0 },
    skippedUnchanged: { type: Number, default: 0 },
    availabilityEventsCreated: { type: Number, default: 0 },
    offersMarkedUnavailable: { type: Number, default: 0 },
    dealPushNotificationsSent: { type: Number, default: 0 },
    message: String,
  },
  { timestamps: true },
);

collectorRunSchema.index({ purchaseOption: 1, finishedAt: -1 });

const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true, index: true },
    expirationTime: Number,
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

const appSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    dealPushThreshold: { type: Number, default: 60 },
    dealScoreWeights: {
      price: { type: Number, default: 0.45 },
      power: { type: Number, default: 0.45 },
      year: { type: Number, default: 0.1 },
    },
  },
  { timestamps: true },
);

export type CarOfferDocument = InferSchemaType<typeof carOfferSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PriceSnapshotDocument = InferSchemaType<typeof priceSnapshotSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type AvailabilityEventDocument = InferSchemaType<
  typeof availabilityEventSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export type CollectorRunDocument = InferSchemaType<typeof collectorRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PushSubscriptionDocument = InferSchemaType<
  typeof pushSubscriptionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export type AppSettingDocument = InferSchemaType<typeof appSettingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CarOffer =
  (mongoose.models.CarOffer as Model<CarOfferDocument>) ||
  mongoose.model<CarOfferDocument>("CarOffer", carOfferSchema);

export const PriceSnapshot =
  (mongoose.models.PriceSnapshot as Model<PriceSnapshotDocument>) ||
  mongoose.model<PriceSnapshotDocument>("PriceSnapshot", priceSnapshotSchema);

export const AvailabilityEvent =
  (mongoose.models.AvailabilityEvent as Model<AvailabilityEventDocument>) ||
  mongoose.model<AvailabilityEventDocument>(
    "AvailabilityEvent",
    availabilityEventSchema,
  );

export const CollectorRun =
  (mongoose.models.CollectorRun as Model<CollectorRunDocument>) ||
  mongoose.model<CollectorRunDocument>("CollectorRun", collectorRunSchema);

export const PushSubscription =
  (mongoose.models.PushSubscription as Model<PushSubscriptionDocument>) ||
  mongoose.model<PushSubscriptionDocument>(
    "PushSubscription",
    pushSubscriptionSchema,
  );

export const AppSetting =
  (mongoose.models.AppSetting as Model<AppSettingDocument>) ||
  mongoose.model<AppSettingDocument>("AppSetting", appSettingSchema);
