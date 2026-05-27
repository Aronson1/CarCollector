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
    fullName: { type: String, required: true },
    brand: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    firstRegistrationDate: String,
    registrationNumber: String,
    labelCode: String,
    details: { type: carDetailsSchema, default: {} },
    rawCreatedAt: Date,
    rawUpdatedAt: Date,
    rawData: Schema.Types.Mixed,
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

export type CarOfferDocument = InferSchemaType<typeof carOfferSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type PriceSnapshotDocument = InferSchemaType<typeof priceSnapshotSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CarOffer =
  (mongoose.models.CarOffer as Model<CarOfferDocument>) ||
  mongoose.model<CarOfferDocument>("CarOffer", carOfferSchema);

export const PriceSnapshot =
  (mongoose.models.PriceSnapshot as Model<PriceSnapshotDocument>) ||
  mongoose.model<PriceSnapshotDocument>("PriceSnapshot", priceSnapshotSchema);
