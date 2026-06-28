import type { Types } from "mongoose";
import type { PriceDelta } from "./types";

export type CayenneSource = "otomoto";
export type CayenneGeneration = "current" | "previous" | "other" | "unknown";
export type CayenneGenerationFilter = "current" | "previous" | "currentAndPrevious";

export interface CayenneDealScoreWeights {
  vatFinancing: number;
  price: number;
  accidentFree: number;
  mileage: number;
}

export interface CayenneDealScore {
  score: number;
  factors: {
    vatFinancing: number;
    price: number;
    accidentFree: number;
    mileage: number;
  };
  reasons: string[];
}

export const defaultCayenneDealScoreWeights: CayenneDealScoreWeights = {
  vatFinancing: 0.3,
  price: 0.3,
  accidentFree: 0.2,
  mileage: 0.2,
};

export interface OtomotoCayenneRawOffer {
  [key: string]: unknown;
  listing_id?: string | number | null;
  id?: string | number | null;
  listing_url?: string | null;
  url?: string | null;
  title?: string | null;
  make?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | number | null;
  price?: string | number | null;
  currency?: string | null;
  mileage_km?: string | number | null;
  fuel_type?: string | null;
  transmission?: string | null;
  engine_power_hp?: string | number | null;
  engine_size_cc?: string | number | null;
  location?: string | null;
  region?: string | null;
  seller_type?: string | null;
  seller_name?: string | null;
  has_vat_invoice?: boolean | string | number | null;
  vat_invoice?: boolean | string | number | null;
  invoice?: boolean | string | number | null;
  financing_available?: boolean | string | number | null;
  financing?: boolean | string | number | null;
  leasing?: boolean | string | number | null;
  is_accident_free?: boolean | string | number | null;
  accident_free?: boolean | string | number | null;
  no_accident?: boolean | string | number | null;
  is_damaged?: boolean | string | number | null;
  damaged?: boolean | string | number | null;
  condition?: string | null;
  description?: string | null;
  is_imported_car?: boolean | string | number | null;
  isImported?: boolean | string | number | null;
  photo_urls?: unknown;
  images?: unknown;
  image_urls?: unknown;
  posted_date?: string | null;
  scraped_at?: string | null;
}

export interface NormalizedCayenneOffer {
  source: CayenneSource;
  externalId: string;
  title: string;
  offerUrl: string;
  imageUrl?: string;
  imageUrls: string[];
  price: number;
  currency: string;
  year?: number;
  mileageKm?: number;
  fuelType?: string;
  transmission?: string;
  enginePowerHp?: number;
  engineSizeCc?: number;
  location?: string;
  region?: string;
  sellerType?: string;
  sellerName?: string;
  hasVatInvoice: boolean;
  hasFinancing: boolean;
  isAccidentFree?: boolean;
  isDamaged: boolean;
  isImportOffer: boolean;
  importReason?: string;
  hasDealRisk: boolean;
  dealRiskReason?: string;
  postedAt?: Date;
  rawData: OtomotoCayenneRawOffer;
}

export interface CayennePriceSnapshotView {
  id: string;
  fetchedAt: string;
  price: number;
  currency: string;
}

export interface CayenneOfferView {
  id: string;
  source: CayenneSource;
  externalId: string;
  title: string;
  offerUrl: string;
  imageUrl?: string;
  imageUrls: string[];
  price: number;
  currency: string;
  year?: number;
  mileageKm?: number;
  fuelType?: string;
  transmission?: string;
  enginePowerHp?: number;
  engineSizeCc?: number;
  location?: string;
  region?: string;
  sellerType?: string;
  sellerName?: string;
  hasVatInvoice: boolean;
  hasFinancing: boolean;
  isAccidentFree?: boolean;
  isDamaged: boolean;
  isImportOffer: boolean;
  importReason?: string;
  hasDealRisk: boolean;
  dealRiskReason?: string;
  generation: CayenneGeneration;
  dealScore?: CayenneDealScore;
  postedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  unavailableSince?: string;
  isAvailable: boolean;
  isWatchlisted: boolean;
  listingAgeLabel: string;
  listingAgeBasis: "published" | "firstSeen";
  priceDelta?: PriceDelta;
  hasPriceChanged: boolean;
  priceHistory: CayennePriceSnapshotView[];
}

export type CayenneSort =
  | "recentlyAdded"
  | "newest"
  | "priceAsc"
  | "priceDesc"
  | "deltaAsc"
  | "deltaDesc"
  | "yearDesc"
  | "dealScoreDesc";

export interface CayenneSearchResult {
  offers: CayenneOfferView[];
  total: number;
  lastRun?: {
    status: "success" | "error";
    finishedAt: string;
    fetched: number;
    newOffers: number;
    priceChanges: number;
    disappeared: number;
    dealPushNotificationsSent?: number;
    message?: string;
  };
}

export type LeanCayenneOffer = {
  _id: Types.ObjectId;
  source: CayenneSource;
  externalId: string;
  title: string;
  offerUrl: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  price: number;
  currency?: string | null;
  year?: number | null;
  mileageKm?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  enginePowerHp?: number | null;
  engineSizeCc?: number | null;
  location?: string | null;
  region?: string | null;
  sellerType?: string | null;
  sellerName?: string | null;
  hasVatInvoice?: boolean | null;
  hasFinancing?: boolean | null;
  isAccidentFree?: boolean | null;
  isDamaged?: boolean | null;
  isImportOffer?: boolean | null;
  importReason?: string | null;
  hasDealRisk?: boolean | null;
  dealRiskReason?: string | null;
  dealPushNotifiedAt?: Date | null;
  dealPushNotifiedScore?: number | null;
  postedAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  unavailableSince?: Date | null;
  isAvailable?: boolean | null;
  isWatchlisted?: boolean | null;
};

export function normalizeOtomotoCayenneOffer(
  offer: OtomotoCayenneRawOffer,
): NormalizedCayenneOffer | undefined {
  const externalId = toStringValue(offer.listing_id ?? offer.id);
  const offerUrl = toStringValue(offer.listing_url ?? offer.url);
  const price = toPositiveInteger(offer.price);

  if (!externalId || !offerUrl || !price) {
    return undefined;
  }

  const title =
    toStringValue(offer.title) ||
    ["Porsche", "Cayenne", toStringValue(offer.version)]
      .filter(Boolean)
      .join(" ");
  const imageUrls = normalizeImageUrls(
    offer.photo_urls ?? offer.image_urls ?? offer.images,
  );
  const damageValue = offer.is_damaged ?? offer.damaged ?? offer.condition;
  const isDamaged = toDamageStatus(damageValue);
  const importAssessment = getImportOfferAssessment(offer);
  const year = toPositiveInteger(offer.year);
  const hasVatInvoice =
    toTruthyStatus(offer.has_vat_invoice ?? offer.vat_invoice ?? offer.invoice) ||
    hasRawSignal(offer, ["invoice_issued", "invoice", "faktura vat", "faktura"]);
  const hasFinancing =
    toTruthyStatus(
      offer.financing_available ?? offer.financing ?? offer.leasing,
    ) || hasRawSignal(offer, ["finansowanie", "financing", "leasing"]);
  const isAccidentFree =
    toOptionalBoolean(
      offer.is_accident_free ?? offer.accident_free ?? offer.no_accident,
    ) ?? (damageValue === undefined || damageValue === null ? undefined : !isDamaged);
  const dealRiskAssessment = getDealRiskAssessment({
    offer,
    price,
    year,
    hasVatInvoice,
    hasFinancing,
  });

  return {
    source: "otomoto",
    externalId,
    title,
    offerUrl,
    imageUrl: imageUrls[0],
    imageUrls,
    price,
    currency: toStringValue(offer.currency) || "PLN",
    year,
    mileageKm: toPositiveInteger(offer.mileage_km),
    fuelType: toStringValue(offer.fuel_type),
    transmission: toStringValue(offer.transmission),
    enginePowerHp: toPositiveInteger(offer.engine_power_hp),
    engineSizeCc: toPositiveInteger(offer.engine_size_cc),
    location: toStringValue(offer.location),
    region: toStringValue(offer.region),
    sellerType: toStringValue(offer.seller_type),
    sellerName: toStringValue(offer.seller_name),
    hasVatInvoice,
    hasFinancing,
    isAccidentFree,
    isDamaged,
    isImportOffer: importAssessment.isImportOffer,
    importReason: importAssessment.reason,
    hasDealRisk: dealRiskAssessment.hasDealRisk,
    dealRiskReason: dealRiskAssessment.reason,
    postedAt: toDate(offer.posted_date),
    rawData: offer,
  };
}

export function buildCayenneOfferView(
  offer: LeanCayenneOffer,
  priceHistory: CayennePriceSnapshotView[],
): CayenneOfferView {
  const listingAgeBasis = offer.postedAt ? "published" : "firstSeen";
  const listingAgeDate = offer.postedAt || offer.firstSeenAt;

  return {
    id: String(offer._id),
    source: offer.source,
    externalId: offer.externalId,
    title: offer.title,
    offerUrl: offer.offerUrl,
    imageUrl: offer.imageUrl || undefined,
    imageUrls: uniqueStrings([offer.imageUrl, ...(offer.imageUrls || [])]),
    price: offer.price,
    currency: offer.currency || "PLN",
    year: offer.year ?? undefined,
    mileageKm: offer.mileageKm ?? undefined,
    fuelType: offer.fuelType || undefined,
    transmission: offer.transmission || undefined,
    enginePowerHp: offer.enginePowerHp ?? undefined,
    engineSizeCc: offer.engineSizeCc ?? undefined,
    location: offer.location || undefined,
    region: offer.region || undefined,
    sellerType: offer.sellerType || undefined,
    sellerName: offer.sellerName || undefined,
    hasVatInvoice: Boolean(offer.hasVatInvoice),
    hasFinancing: Boolean(offer.hasFinancing),
    isAccidentFree: offer.isAccidentFree ?? undefined,
    isDamaged: Boolean(offer.isDamaged),
    isImportOffer: Boolean(offer.isImportOffer),
    importReason: offer.importReason || undefined,
    hasDealRisk: Boolean(offer.hasDealRisk),
    dealRiskReason: offer.dealRiskReason || undefined,
    generation: getCayenneGeneration(offer.year ?? undefined),
    postedAt: offer.postedAt?.toISOString(),
    firstSeenAt: offer.firstSeenAt.toISOString(),
    lastSeenAt: offer.lastSeenAt.toISOString(),
    unavailableSince: offer.unavailableSince?.toISOString(),
    isAvailable: offer.isAvailable ?? true,
    isWatchlisted: Boolean(offer.isWatchlisted),
    listingAgeLabel: formatListingAge(listingAgeDate),
    listingAgeBasis,
    priceDelta: getCayennePriceDelta(priceHistory),
    hasPriceChanged: hasCayennePriceChanged(priceHistory),
    priceHistory,
  };
}

function getCayennePriceDelta(
  priceHistory: CayennePriceSnapshotView[],
): PriceDelta | undefined {
  const prices = priceHistory
    .map((snapshot) => snapshot.price)
    .filter((price): price is number => Number.isFinite(price) && price > 0);

  if (prices.length < 2) {
    return undefined;
  }

  const latestPrice = prices.at(-1) as number;
  const previousPrice = prices.at(-2) as number;
  const amount = latestPrice - previousPrice;

  return {
    amount,
    percent: previousPrice > 0 ? (amount / previousPrice) * 100 : 0,
    previousPrice,
    latestPrice,
  };
}

function hasCayennePriceChanged(
  priceHistory: CayennePriceSnapshotView[],
): boolean {
  const uniquePrices = new Set(
    priceHistory
      .map((snapshot) => snapshot.price)
      .filter((price) => Number.isFinite(price) && price > 0),
  );

  return uniquePrices.size > 1;
}

export function applyCayenneDealScores(
  offers: CayenneOfferView[],
  weights: CayenneDealScoreWeights = defaultCayenneDealScoreWeights,
): CayenneOfferView[] {
  const normalizedWeights = normalizeCayenneDealScoreWeights(weights);
  const prices = offers.map((offer) => offer.price).filter(isPositiveNumber);
  const mileages = offers
    .map((offer) => offer.mileageKm)
    .filter(isPositiveNumber);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minMileage = Math.min(...mileages);
  const maxMileage = Math.max(...mileages);

  return offers.map((offer) => {
    const factors = {
      vatFinancing: getVatFinancingFactor(offer),
      price: getLowerIsBetterFactor(offer.price, minPrice, maxPrice),
      accidentFree: getAccidentFreeFactor(offer),
      mileage: getLowerIsBetterFactor(offer.mileageKm, minMileage, maxMileage),
    };
    const baseScore = Math.round(
      100 *
        (factors.vatFinancing * normalizedWeights.vatFinancing +
          factors.price * normalizedWeights.price +
          factors.accidentFree * normalizedWeights.accidentFree +
          factors.mileage * normalizedWeights.mileage),
    );
    const score = offer.hasDealRisk ? Math.min(baseScore, 45) : baseScore;

    return {
      ...offer,
      dealScore: {
        score,
        factors,
        reasons: getCayenneDealScoreReasons(offer, factors),
      },
    };
  });
}

export function normalizeCayenneDealScoreWeights(
  weights: Partial<CayenneDealScoreWeights> = {},
): CayenneDealScoreWeights {
  const positiveWeights = {
    vatFinancing: clampWeight(
      weights.vatFinancing,
      defaultCayenneDealScoreWeights.vatFinancing,
    ),
    price: clampWeight(weights.price, defaultCayenneDealScoreWeights.price),
    accidentFree: clampWeight(
      weights.accidentFree,
      defaultCayenneDealScoreWeights.accidentFree,
    ),
    mileage: clampWeight(weights.mileage, defaultCayenneDealScoreWeights.mileage),
  };
  const total =
    positiveWeights.vatFinancing +
    positiveWeights.price +
    positiveWeights.accidentFree +
    positiveWeights.mileage;

  if (total <= 0) {
    return defaultCayenneDealScoreWeights;
  }

  return {
    vatFinancing: roundWeight(positiveWeights.vatFinancing / total),
    price: roundWeight(positiveWeights.price / total),
    accidentFree: roundWeight(positiveWeights.accidentFree / total),
    mileage: roundWeight(positiveWeights.mileage / total),
  };
}

export function getCayenneIdentityKey(
  offer: Pick<NormalizedCayenneOffer, "source" | "externalId">,
): string {
  return `${offer.source}:${offer.externalId}`;
}

export function shouldCreateCayennePriceSnapshot(
  latestSnapshot: { price: number; currency: string } | undefined,
  offer: Pick<NormalizedCayenneOffer, "price" | "currency">,
): boolean {
  return (
    !latestSnapshot ||
    latestSnapshot.price !== offer.price ||
    latestSnapshot.currency !== offer.currency
  );
}

export function getCayenneGeneration(year?: number): CayenneGeneration {
  if (!year) {
    return "unknown";
  }

  if (year >= 2017) {
    return "current";
  }

  if (year >= 2010 && year <= 2016) {
    return "previous";
  }

  return "other";
}

export function formatListingAge(date: Date, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays <= 0) {
    return "dzisiaj";
  }

  if (diffDays === 1) {
    return "1 dzień";
  }

  return `${diffDays} dni`;
}

function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(
    value.map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        const record = item as { url?: unknown; uri?: unknown; src?: unknown };
        return toStringValue(record.url ?? record.uri ?? record.src);
      }

      return undefined;
    }),
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  return undefined;
}

function toDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDamageStatus(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (
    ["true", "1", "yes", "tak", "uszkodzony", "damaged"].includes(normalized)
  ) {
    return true;
  }

  return false;
}

function toTruthyStatus(value: unknown): boolean {
  return toOptionalBoolean(value) === true;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (
    ["true", "1", "yes", "tak", "y", "vat", "faktura", "bezwypadkowy"].includes(
      normalized,
    )
  ) {
    return true;
  }

  if (["false", "0", "no", "nie", "n"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function getImportOfferAssessment(offer: OtomotoCayenneRawOffer): {
  isImportOffer: boolean;
  reason?: string;
} {
  const description = normalizeSearchText(toStringValue(offer.description));
  const sellerName = normalizeSearchText(toStringValue(offer.seller_name));
  const locationText = normalizeSearchText(
    [offer.location, offer.region].map(toStringValue).filter(Boolean).join(" "),
  );
  const searchableText = [description, sellerName, locationText].join(" ");

  if (
    hasAnyTextSignal(searchableText, [
      "lokalizacja dubaj",
      "lokalizacja zea",
      "lokalizacja usa",
      "znajduje sie w usa",
      "znajduje sie w stanach",
      "w trakcie transportu z usa",
      "w transporcie z usa",
      "auto jest w trakcie transportu",
      "cena pod dom",
      "import auta z usa",
      "import z usa",
      "wybrane oferty z ameryki",
      "grupa ameryka",
      "od wyboru auta po rejestracje",
    ])
  ) {
    return {
      isImportOffer: true,
      reason: "Oferta importowa lub auto poza Polską",
    };
  }

  return { isImportOffer: false };
}

function getDealRiskAssessment({
  offer,
  price,
  year,
  hasVatInvoice,
  hasFinancing,
}: {
  offer: OtomotoCayenneRawOffer;
  price: number;
  year?: number;
  hasVatInvoice: boolean;
  hasFinancing: boolean;
}): { hasDealRisk: boolean; reason?: string } {
  const description = normalizeSearchText(toStringValue(offer.description));
  const sellerName = normalizeSearchText(toStringValue(offer.seller_name));
  const searchableText = [description, sellerName].join(" ");
  const isVeryCheapCurrentGeneration = Boolean(year && year >= 2017 && price <= 120_000);
  const hasImportHistorySignal = hasAnyTextSignal(searchableText, [
    "samochod importowany",
    "auto importowane",
    "importowany",
    "sprowadzony z usa",
    "sprowadzona z usa",
    "auto sprowadzone z usa",
    "z rynku amerykanskiego",
  ]);

  if (
    isVeryCheapCurrentGeneration &&
    hasImportHistorySignal &&
    !hasVatInvoice &&
    !hasFinancing
  ) {
    return {
      hasDealRisk: true,
      reason: "Ryzyko: bardzo niska cena, import i brak VAT/finansowania",
    };
  }

  return { hasDealRisk: false };
}

function normalizeSearchText(value: string | undefined): string {
  return stripHtml(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function hasAnyTextSignal(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function hasRawSignal(value: unknown, needles: string[]): boolean {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
  const stack = [value];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current || seen.has(current)) {
      continue;
    }

    if (typeof current === "string" || typeof current === "number") {
      const normalized = String(current).toLowerCase();
      if (normalizedNeedles.some((needle) => normalized.includes(needle))) {
        return true;
      }
      continue;
    }

    if (typeof current !== "object") {
      continue;
    }

    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
    } else {
      stack.push(...Object.values(current as Record<string, unknown>));
    }
  }

  return false;
}

function getVatFinancingFactor(offer: CayenneOfferView): number {
  if (offer.hasVatInvoice && offer.hasFinancing) {
    return 1;
  }

  if (offer.hasVatInvoice) {
    return 0.7;
  }

  if (offer.hasFinancing) {
    return 0.5;
  }

  return 0;
}

function getAccidentFreeFactor(offer: CayenneOfferView): number {
  if (offer.isAccidentFree === true) {
    return 1;
  }

  if (offer.isAccidentFree === false || offer.isDamaged) {
    return 0;
  }

  return 0.5;
}

function getLowerIsBetterFactor(
  value: number | undefined,
  min: number,
  max: number,
): number {
  if (!isPositiveNumber(value)) {
    return 0.5;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return 1;
  }

  return clamp01(1 - (value - min) / (max - min));
}

function getCayenneDealScoreReasons(
  offer: CayenneOfferView,
  factors: CayenneDealScore["factors"],
): string[] {
  const reasons = [];

  if (offer.hasDealRisk && offer.dealRiskReason) {
    reasons.push(offer.dealRiskReason);
  }

  if (offer.hasVatInvoice && offer.hasFinancing) {
    reasons.push("Faktura VAT i finansowanie");
  } else if (offer.hasVatInvoice) {
    reasons.push("Faktura VAT");
  } else if (offer.hasFinancing) {
    reasons.push("Finansowanie");
  } else {
    reasons.push("Brak potwierdzonej faktury VAT/finansowania");
  }

  if (offer.isAccidentFree === true) {
    reasons.push("Bezwypadkowy");
  } else if (offer.isAccidentFree === false) {
    reasons.push("Brak deklaracji bezwypadkowości");
  } else {
    reasons.push("Nieznana bezwypadkowość");
  }

  if (factors.price >= 0.8) {
    reasons.push("Cena dobra względem listy");
  }

  if (factors.mileage >= 0.8) {
    reasons.push("Niski przebieg względem listy");
  }

  return reasons;
}

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clampWeight(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp01(parsed);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}
