export type CarSource = "arval";

export type PriceVector = number[];

export interface CarDetails {
  mileage?: number;
  registrationYear?: number;
  fuelTypeLabel?: string;
  gearbox?: string;
  warrantyMonths?: number;
}

export interface CarOfferView {
  id: string;
  source: CarSource;
  externalId: string;
  offerUrl?: string;
  imageUrl?: string;
  fullName: string;
  brand: string;
  model: string;
  firstRegistrationDate?: string;
  registrationNumber?: string;
  labelCode?: string;
  announcementCreatedAt?: string;
  announcementUpdatedAt?: string;
  details: CarDetails;
  latestPrices: PriceVector;
  latestFetchedAt?: string;
  hasPriceChanged: boolean;
  priceHistory: PriceSnapshotView[];
}

export interface PriceSnapshotView {
  id: string;
  fetchedAt: string;
  rawUpdatedAt?: string;
  prices: PriceVector;
}

export interface ArvalAnnouncement {
  [key: string]: unknown;
  id: number | string;
  offerUrl?: string;
  mainImage?: string;
  mainUrl?: string;
  trim?: string;
  make?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  firstRegistrationDate?: string;
  registrationNumber?: string;
  labelCode?: string;
  details?: CarDetails;
  reLeasePriceNet?: number | string | null;
  reLeasePrice2Net?: number | string | null;
  reLeasePrice3Net?: number | string | null;
}

export interface NormalizedArvalOffer {
  source: CarSource;
  externalId: string;
  offerUrl?: string;
  imageUrl?: string;
  fullName: string;
  brand: string;
  model: string;
  firstRegistrationDate?: string;
  registrationNumber?: string;
  labelCode?: string;
  details: CarDetails;
  rawCreatedAt?: Date;
  rawUpdatedAt?: Date;
  rawData: ArvalAnnouncement;
  prices: PriceVector;
}
