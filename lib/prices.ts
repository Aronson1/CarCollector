import type {
  ArvalAnnouncement,
  ArvalNewCarOffer,
  NormalizedArvalOffer,
  PriceDelta,
  PriceVector,
  PurchaseOption,
} from "./types";
import { parsePowerHp } from "./power.ts";

export function toFinitePrice(value: unknown): number {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

function toPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function kilowattsToHorsePower(value: number): number {
  return Math.round(value * 1.359621617);
}

export function normalizeArvalPowerHp(
  announcement: Pick<ArvalAnnouncement, "horsePower" | "power" | "trim">,
): number | undefined {
  const horsePower = toPositiveNumber(announcement.horsePower);

  if (horsePower) {
    return Math.round(horsePower);
  }

  const kilowatts = toPositiveNumber(announcement.power);

  if (kilowatts) {
    return kilowattsToHorsePower(kilowatts);
  }

  return parsePowerHp(announcement.trim);
}

export function normalizePriceVector(
  announcement: Pick<
    ArvalAnnouncement,
    "reLeasePriceNet" | "reLeasePrice2Net" | "reLeasePrice3Net" | "salePriceNet"
  > &
    Pick<ArvalNewCarOffer, "leasePrice" | "priceGridRental">,
  purchaseOption: PurchaseOption = "release",
): PriceVector {
  if (purchaseOption === "sale") {
    return [toFinitePrice(announcement.salePriceNet)];
  }

  if (purchaseOption === "newRelease") {
    return [
      toFinitePrice(announcement.leasePrice || announcement.priceGridRental),
    ];
  }

  return [
    toFinitePrice(announcement.reLeasePriceNet),
    toFinitePrice(announcement.reLeasePrice2Net),
    toFinitePrice(announcement.reLeasePrice3Net),
  ];
}

export function pricesEqual(left: PriceVector, right: PriceVector): boolean {
  return left.length === right.length && left.every((price, index) => price === right[index]);
}

export function hasPriceChanged(history: PriceVector[]): boolean {
  const uniquePrices = new Set(history.flatMap((prices) => prices.filter((price) => price > 0)));
  return uniquePrices.size > 1;
}

export function getPrimaryPriceDelta(history: PriceVector[]): PriceDelta | undefined {
  const prices = history
    .map((snapshot) => snapshot[0])
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

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeArvalAnnouncementImageUrls(
  announcement: ArvalAnnouncement,
): string[] {
  const detailImages = (announcement.images || [])
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((image) => image.uri);

  return uniqueStrings([
    announcement.mainImage,
    announcement.mainUrl,
    ...detailImages,
  ]);
}

function normalizeArvalNewCarImageUrls(offer: ArvalNewCarOffer): string[] {
  return uniqueStrings([offer.imagePath, ...(offer.imagePaths || [])]);
}

export function normalizeArvalEquipmentItems(
  announcement: Pick<ArvalAnnouncement, "equipments">,
): string[] {
  return uniqueStrings(
    (announcement.equipments || []).map((item) => item.specification),
  );
}

export function normalizeArvalAnnouncement(
  announcement: ArvalAnnouncement,
  purchaseOption: PurchaseOption = announcement.purchaseOption || "release",
): NormalizedArvalOffer {
  const externalId = String(announcement.id);
  const imageUrls = normalizeArvalAnnouncementImageUrls(announcement);
  const equipmentItems = normalizeArvalEquipmentItems(announcement);

  return {
    source: "arval",
    purchaseOption,
    externalId,
    offerUrl: announcement.offerUrl,
    imageUrl: imageUrls[0],
    imageUrls,
    equipmentItems,
    fullName: announcement.trim || `${announcement.make || "Unknown"} ${announcement.model || ""}`.trim(),
    brand: announcement.make || "Unknown",
    model: announcement.model || "Unknown",
    firstRegistrationDate: announcement.firstRegistrationDate,
    registrationNumber: announcement.registrationNumber,
    labelCode: announcement.labelCode,
    details: {
      ...(announcement.details || {}),
      powerHp: normalizeArvalPowerHp(announcement),
    },
    rawCreatedAt: announcement.createdAt ? new Date(announcement.createdAt) : undefined,
    rawUpdatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : undefined,
    rawData: announcement,
    prices: normalizePriceVector(announcement, purchaseOption),
  };
}

export function normalizeArvalNewCarOffer(
  offer: ArvalNewCarOffer,
): NormalizedArvalOffer {
  const externalId = String(offer.offerId);
  const brand = offer.makeName || "Unknown";
  const model = offer.modelName || "Unknown";
  const catalogName = offer.vehicleCatalogName || offer.versionName;
  const imageUrls = normalizeArvalNewCarImageUrls(offer);

  return {
    source: "arval",
    purchaseOption: "newRelease",
    externalId,
    offerUrl: offer.url
      ? new URL(offer.url, "https://www.arval.pl").toString()
      : undefined,
    imageUrl: imageUrls[0],
    imageUrls,
    equipmentItems: [],
    fullName: [brand, model, catalogName].filter(Boolean).join(" "),
    brand,
    model,
    details: {
      annualMileage: toFinitePrice(offer.mileage) || undefined,
      contractMonths: toFinitePrice(offer.duration) || undefined,
      downPayment: toFinitePrice(offer.downPayment) || undefined,
      fuelTypeLabel: offer.fuelTypeName,
      gearbox: offer.transmissionTypeName,
      powerHp: toPositiveNumber(offer.horsePower) ?? parsePowerHp(
        [offer.vehicleCatalogName, offer.versionName].filter(Boolean).join(" "),
      ),
    },
    rawUpdatedAt: offer.updateDate ? new Date(offer.updateDate) : undefined,
    rawData: offer,
    prices: normalizePriceVector(offer, "newRelease"),
  };
}
