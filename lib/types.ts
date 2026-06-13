export type CarSource = "arval";

export type PurchaseOption = "release" | "sale" | "newRelease";

export type PriceVector = number[];

export type AvailabilityEventType = "firstSeen" | "returned" | "disappeared";

export type AvailabilityStatus = "available" | "unavailable";

export interface PriceDelta {
  amount: number;
  percent: number;
  previousPrice: number;
  latestPrice: number;
}

export interface DealScore {
  score: number;
  reasons: string[];
  factors: {
    price: number;
    year: number;
    mileage: number;
    trend: number;
    power: number;
    equipment: number;
  };
}

export interface DealScoreWeights {
  price: number;
  power: number;
  year: number;
}

export interface CarDetails {
  mileage?: number;
  annualMileage?: number;
  registrationYear?: number;
  fuelTypeLabel?: string;
  gearbox?: string;
  warrantyMonths?: number;
  contractMonths?: number;
  downPayment?: number;
  powerHp?: number;
}

export interface CarOfferView {
  id: string;
  source: CarSource;
  purchaseOption: PurchaseOption;
  externalId: string;
  offerUrl?: string;
  imageUrl?: string;
  imageUrls: string[];
  equipmentItems: string[];
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
  priceDelta?: PriceDelta;
  dealScore?: DealScore;
  isAvailable: boolean;
  availableSince?: string;
  unavailableSince?: string;
  lastSeenAt?: string;
  lastAvailabilityChangeAt?: string;
  availabilityHistory: AvailabilityEventView[];
  hasPriceChanged: boolean;
  isWatchlisted: boolean;
  priceHistory: PriceSnapshotView[];
}

export interface AvailabilityEventView {
  id: string;
  purchaseOption: PurchaseOption;
  eventType: AvailabilityEventType;
  status: AvailabilityStatus;
  eventAt: string;
}

export interface PriceSnapshotView {
  id: string;
  purchaseOption: PurchaseOption;
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
  images?: Array<{
    uri?: string;
    order?: number;
  }>;
  equipments?: Array<{
    specification?: string;
    category?: string;
    deliveredAs?: string;
    name?: string;
    type?: string;
    ranking?: number;
    visibleWindowPdf?: boolean;
  }>;
  trim?: string;
  make?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  firstRegistrationDate?: string;
  registrationNumber?: string;
  labelCode?: string;
  reservationLabelCode?: string | null;
  details?: CarDetails;
  purchaseOption?: PurchaseOption;
  reLeasePriceNet?: number | string | null;
  reLeasePrice2Net?: number | string | null;
  reLeasePrice3Net?: number | string | null;
  salePriceNet?: number | string | null;
  power?: number | string | null;
  horsePower?: number | string | null;
}

export interface ArvalNewCarOffer {
  [key: string]: unknown;
  offerId: number | string;
  url?: string;
  imagePath?: string;
  imagePaths?: string[];
  makeName?: string;
  modelName?: string;
  vehicleCatalogName?: string;
  versionName?: string;
  fuelTypeName?: string;
  transmissionTypeName?: string;
  updateDate?: string;
  status?: string | null;
  horsePower?: number | string | null;
  leasePrice?: number | string | null;
  priceGridRental?: number | string | null;
  downPayment?: number | string | null;
  duration?: number | string | null;
  mileage?: number | string | null;
}

export interface NormalizedArvalOffer {
  source: CarSource;
  purchaseOption: PurchaseOption;
  externalId: string;
  offerUrl?: string;
  imageUrl?: string;
  imageUrls: string[];
  equipmentItems: string[];
  fullName: string;
  brand: string;
  model: string;
  firstRegistrationDate?: string;
  registrationNumber?: string;
  labelCode?: string;
  details: CarDetails;
  rawCreatedAt?: Date;
  rawUpdatedAt?: Date;
  rawData: ArvalAnnouncement | ArvalNewCarOffer;
  prices: PriceVector;
}
