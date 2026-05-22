import type { ArvalAnnouncement, NormalizedArvalOffer, PriceVector } from "./types";

export function toFinitePrice(value: unknown): number {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

export function normalizePriceVector(announcement: Pick<
  ArvalAnnouncement,
  "reLeasePriceNet" | "reLeasePrice2Net" | "reLeasePrice3Net"
>): PriceVector {
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

export function normalizeArvalAnnouncement(
  announcement: ArvalAnnouncement,
): NormalizedArvalOffer {
  const externalId = String(announcement.id);

  return {
    source: "arval",
    externalId,
    offerUrl: announcement.offerUrl,
    imageUrl: announcement.mainImage || announcement.mainUrl,
    fullName: announcement.trim || `${announcement.make || "Unknown"} ${announcement.model || ""}`.trim(),
    brand: announcement.make || "Unknown",
    model: announcement.model || "Unknown",
    firstRegistrationDate: announcement.firstRegistrationDate,
    registrationNumber: announcement.registrationNumber,
    labelCode: announcement.labelCode,
    details: announcement.details || {},
    rawCreatedAt: announcement.createdAt ? new Date(announcement.createdAt) : undefined,
    rawUpdatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : undefined,
    rawData: announcement,
    prices: normalizePriceVector(announcement),
  };
}
