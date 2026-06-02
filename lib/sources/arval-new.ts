import type { ArvalNewCarOffer } from "../types";

const defaultNewCarsUrl =
  "https://www.arval.pl/wynajem-oferty/wynajem-dlugoterminowy-male-floty";
const defaultPageSize = 12;
const maxPages = 25;

interface ArvalNewCarsOverviewPage {
  offerSummaries?: ArvalNewCarOffer[];
  totalElements?: number;
  totalPages?: number;
}

interface OverviewRequestConfig {
  endpoint: string;
  detailBaseUrl: string;
  overviewUrl: string;
  lang: string;
  pageSize: number;
  sortBy: string;
  sortDirection: string;
  referer: string;
}

export async function fetchArvalNewCarOffers(
  url = process.env.ARVAL_NEW_CARS_URL || defaultNewCarsUrl,
): Promise<ArvalNewCarOffer[]> {
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Arval new cars request failed with status ${response.status}`);
  }

  const html = await response.text();
  const nextData = extractNextData(html);
  const offers = findOfferSummaries(nextData);
  const config = buildOverviewRequestConfig(nextData, url, offers?.length);

  try {
    const paginatedOffers = await fetchPaginatedOffers(config, offers || []);
    return paginatedOffers.length > 0 ? paginatedOffers : offers || [];
  } catch (error) {
    if (offers) {
      return offers;
    }

    throw error;
  }
}

function extractNextData(html: string) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/,
  );

  if (!match?.[1]) {
    throw new Error("Arval new cars page did not include __NEXT_DATA__.");
  }

  return JSON.parse(match[1]) as unknown;
}

function findOfferSummaries(value: unknown): ArvalNewCarOffer[] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    "offers" in value &&
    value.offers &&
    typeof value.offers === "object" &&
    "offerSummaries" in value.offers &&
    Array.isArray(value.offers.offerSummaries)
  ) {
    return value.offers.offerSummaries as ArvalNewCarOffer[];
  }

  for (const nested of Object.values(value)) {
    const offers = findOfferSummaries(nested);

    if (offers) {
      return offers;
    }
  }

  return null;
}

function buildOverviewRequestConfig(
  nextData: unknown,
  url: string,
  initialOfferCount = defaultPageSize,
): OverviewRequestConfig {
  const sourceUrl = new URL(url);
  const basePath = sourceUrl.pathname.startsWith("/wynajem-oferty")
    ? "/wynajem-oferty"
    : "";

  return {
    endpoint: new URL(`${basePath}/_next/api/offers/overview`, sourceUrl.origin)
      .toString(),
    detailBaseUrl: new URL(
      `${basePath}${normalizePath(
        findStringByKey(nextData, "overviewUrl") ||
          findStringByKey(nextData, "originalUrl") ||
          "/wynajem-dlugoterminowy-male-floty",
      )}/undefined/undefined/`,
      sourceUrl.origin,
    ).toString(),
    overviewUrl:
      findStringByKey(nextData, "overviewUrl") ||
      findStringByKey(nextData, "originalUrl") ||
      "/wynajem-dlugoterminowy-male-floty",
    lang: findLanguageCode(nextData) || "pl-pl",
    pageSize: Math.max(defaultPageSize, initialOfferCount || defaultPageSize),
    sortBy: findStringByKey(nextData, "sortBy") || "",
    sortDirection: findStringByKey(nextData, "sortDirection") || "asc",
    referer: url,
  };
}

async function fetchPaginatedOffers(
  config: OverviewRequestConfig,
  initialOffers: ArvalNewCarOffer[],
): Promise<ArvalNewCarOffer[]> {
  const offers = new Map(
    initialOffers.map((offer) => [String(offer.offerId), offer]),
  );
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, maxPages); page += 1) {
    const overviewPage = await fetchOverviewPage(config, page);
    const pageOffers = overviewPage.offerSummaries || [];

    for (const offer of pageOffers) {
      const offerId = String(offer.offerId);
      offers.set(offerId, mergeNewCarOffer(offer, offers.get(offerId)));
    }

    totalPages = overviewPage.totalPages || totalPages;

    if (pageOffers.length === 0 || offers.size >= (overviewPage.totalElements || Infinity)) {
      break;
    }
  }

  return enrichMissingOfferDetails(config, Array.from(offers.values()));
}

async function fetchOverviewPage(
  config: OverviewRequestConfig,
  page: number,
): Promise<ArvalNewCarsOverviewPage> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(config.pageSize),
    sortBy: config.sortBy,
    sortDirection: config.sortDirection,
    overviewUrl: config.overviewUrl,
    lang: config.lang,
  });

  const response = await fetch(`${config.endpoint}?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Referer: config.referer,
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Arval new cars overview request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<ArvalNewCarsOverviewPage>;
}

async function enrichMissingOfferDetails(
  config: OverviewRequestConfig,
  offers: ArvalNewCarOffer[],
): Promise<ArvalNewCarOffer[]> {
  return Promise.all(
    offers.map(async (offer) => {
      if (hasOfferIdentity(offer) && offer.horsePower) {
        return offer;
      }

      try {
        const detailedOffer = await fetchOfferDetails(config, offer);
        return mergeNewCarOffer(detailedOffer, offer);
      } catch {
        return offer;
      }
    }),
  );
}

async function fetchOfferDetails(
  config: OverviewRequestConfig,
  offer: ArvalNewCarOffer,
): Promise<ArvalNewCarOffer> {
  const detailUrl = new URL(String(offer.offerId), config.detailBaseUrl).toString();
  const response = await fetch(detailUrl, {
    headers: {
      Accept: "text/html",
      Referer: config.referer,
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Arval new car detail request failed with status ${response.status}`,
    );
  }

  const nextData = extractNextData(await response.text());
  const pageOffer = findDetailPageOffer(nextData);

  if (!pageOffer) {
    throw new Error(`Arval new car detail page did not include offer ${offer.offerId}.`);
  }

  return {
    ...pageOffer,
    url: detailUrl,
  };
}

function findDetailPageOffer(value: unknown): ArvalNewCarOffer | null {
  const pageOffer = getObjectPath(value, ["props", "pageProps", "offer"]);

  if (!pageOffer) {
    return null;
  }

  const tokens = asRecord(pageOffer.tokens);
  const offerEnvelope = asRecord(pageOffer.offer);
  const offerDetail = asRecord(offerEnvelope?.offerDetail);
  const specifications = Array.isArray(pageOffer.specifications)
    ? pageOffer.specifications
    : [];

  return {
    offerId: readStringOrNumber(tokens?.id) || readStringOrNumber(offerEnvelope?.offerId) || "",
    makeName:
      readString(tokens?.make) ||
      findSpecificationValue(specifications, "brand") ||
      readNestedLocalizedName(pageOffer.makes, "makeDetail"),
    modelName:
      readString(tokens?.model) ||
      findSpecificationValue(specifications, "model") ||
      readNestedLocalizedName(pageOffer.models, "modelDetail"),
    vehicleCatalogName:
      readString(tokens?.versionName) ||
      findSpecificationValue(specifications, "version") ||
      readNestedLocalizedName(pageOffer.catalogs, "vehicleCatalogDetail"),
    fuelTypeName:
      readString(tokens?.fuelTypeName) ||
      findSpecificationValue(specifications, "fuelTypeName"),
    transmissionTypeName: findSpecificationValue(
      specifications,
      "transmissionTypeName",
    ),
    horsePower: readStringOrNumber(findSpecificationValue(specifications, "horsePower")),
    imagePath: findImagePath(offerDetail),
    leasePrice: readStringOrNumber(tokens?.price),
    downPayment: readStringOrNumber(tokens?.downpayment),
    duration: readStringOrNumber(tokens?.duration),
    mileage: readStringOrNumber(tokens?.mileage),
  };
}

function mergeNewCarOffer(
  offer: ArvalNewCarOffer,
  existing?: ArvalNewCarOffer,
): ArvalNewCarOffer {
  if (!existing) {
    return offer;
  }

  return {
    ...existing,
    ...offer,
    makeName: offer.makeName || existing.makeName,
    modelName: offer.modelName || existing.modelName,
    vehicleCatalogName: offer.vehicleCatalogName || existing.vehicleCatalogName,
    versionName: offer.versionName || existing.versionName,
    fuelTypeName: offer.fuelTypeName || existing.fuelTypeName,
    transmissionTypeName:
      offer.transmissionTypeName || existing.transmissionTypeName,
    horsePower: offer.horsePower || existing.horsePower,
    imagePath: offer.imagePath || existing.imagePath,
    url: offer.url || existing.url,
    downPayment: offer.downPayment || existing.downPayment,
    duration: offer.duration || existing.duration,
    mileage: offer.mileage || existing.mileage,
  };
}

function hasOfferIdentity(offer: ArvalNewCarOffer): boolean {
  return Boolean(offer.makeName && offer.modelName);
}

function findStringByKey(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directValue = record[key];

  if (typeof directValue === "string") {
    return directValue;
  }

  for (const nested of Object.values(record)) {
    const match = findStringByKey(nested, key);

    if (match !== null) {
      return match;
    }
  }

  return null;
}

function findLanguageCode(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const language = record.language;

  if (language && typeof language === "object") {
    const code = (language as Record<string, unknown>).code;

    if (typeof code === "string") {
      return code;
    }
  }

  for (const nested of Object.values(record)) {
    const match = findLanguageCode(nested);

    if (match !== null) {
      return match;
    }
  }

  return null;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getObjectPath(
  value: unknown,
  keys: string[],
): Record<string, unknown> | null {
  let current = asRecord(value);

  for (const key of keys) {
    current = asRecord(current?.[key]);

    if (!current) {
      return null;
    }
  }

  return current;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === "number" || (typeof value === "string" && value)) {
    return value;
  }

  return undefined;
}

function findSpecificationValue(specifications: unknown[], code: string): string | undefined {
  for (const specification of specifications) {
    const record = asRecord(specification);

    if (record?.code === code) {
      return readString(record.value);
    }
  }

  return undefined;
}

function readNestedLocalizedName(
  value: unknown,
  detailKey: string,
): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    const record = asRecord(item);
    const detail = asRecord(record?.[detailKey]);
    const localizedDetails = asRecord(detail?.localizedDetails);
    const name = readString(localizedDetails?.name);

    if (name) {
      return name;
    }
  }

  return undefined;
}

function findImagePath(offerDetail: Record<string, unknown> | null): string | undefined {
  const images = offerDetail?.images;

  if (!Array.isArray(images)) {
    return undefined;
  }

  for (const image of images) {
    const imageRecord = asRecord(image);
    const sizes = imageRecord?.sizes;

    if (!Array.isArray(sizes)) {
      continue;
    }

    for (const size of sizes) {
      const path = readString(asRecord(size)?.path);

      if (path) {
        return path;
      }
    }
  }

  return undefined;
}
