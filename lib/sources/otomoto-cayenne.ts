import type { OtomotoCayenneRawOffer } from "../cayenne";

const defaultActorId = "devilscrapes/otomoto-poland-cars";
const defaultSearchUrl =
  "https://www.otomoto.pl/osobowe/porsche/cayenne?search%5Bfilter_enum_damaged%5D=0&search%5Bfilter_enum_generation%5D=gen-iii-2017-cayenne&search%5Bfilter_float_price%3Ato%5D=250000";
const defaultMaxResults = 100;
const defaultApifyTimeoutMs = 20_000;
const detailFetchTimeoutMs = 4_000;
const detailFetchConcurrency = 6;
const publicOtomotoHeaders = {
  "accept-language": "pl-PL,pl;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
};

export async function fetchOtomotoCayenneOffers(): Promise<
  OtomotoCayenneRawOffer[]
> {
  const token = process.env.APIFY_TOKEN;

  if (!token) {
    return fetchPublicOtomotoCayenneOffers();
  }

  const actorId = process.env.CAYENNE_OTOMOTO_ACTOR_ID || defaultActorId;
  const encodedActorId = actorId.replace("/", "~");
  const maxResults = parseMaxResults(process.env.CAYENNE_OTOMOTO_MAX_RESULTS);
  const timeoutMs = parsePositiveInteger(
    process.env.CAYENNE_OTOMOTO_APIFY_TIMEOUT_MS,
    defaultApifyTimeoutMs,
  );

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodedActorId}/run-sync-get-dataset-items?token=${encodeURIComponent(
        token,
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          searchUrl: process.env.CAYENNE_OTOMOTO_SEARCH_URL || defaultSearchUrl,
          maxResults,
          enrichDetails: true,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ["RESIDENTIAL"],
          },
        }),
      },
    );

    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(getApifyErrorMessage(payload) || "Apify request failed.");
    }

    if (!Array.isArray(payload)) {
      throw new Error("Apify response did not contain a dataset array.");
    }

    const actorOffers = payload.filter(
      (item): item is OtomotoCayenneRawOffer =>
        Boolean(item && typeof item === "object"),
    );

    if (actorOffers.length >= maxResults) {
      return actorOffers;
    }

    try {
      return mergeRawOffers(
        actorOffers,
        await fetchPublicOtomotoCayenneOffers(),
      ).slice(0, maxResults);
    } catch (fallbackError) {
      console.warn(
        "Public OTOMOTO fallback failed after Apify returned partial results.",
        fallbackError,
      );
      return actorOffers;
    }
  } catch (error) {
    console.warn(
      "Apify OTOMOTO collector failed or timed out; using public fallback.",
      error,
    );
    return fetchPublicOtomotoCayenneOffers();
  }
}

export async function fetchPublicOtomotoCayenneOffers(): Promise<
  OtomotoCayenneRawOffer[]
> {
  const searchUrl = process.env.CAYENNE_OTOMOTO_SEARCH_URL || defaultSearchUrl;
  const maxResults = parseMaxResults(process.env.CAYENNE_OTOMOTO_MAX_RESULTS);
  const candidates = new Map<string, OtomotoCayenneRawOffer>();
  const maxPages = Math.min(20, Math.max(1, Math.ceil(maxResults / 20) + 2));

  for (let page = 1; page <= maxPages && candidates.size < maxResults; page += 1) {
    const response = await fetch(buildPublicSearchPageUrl(searchUrl, page), {
      headers: publicOtomotoHeaders,
    });

    if (!response.ok) {
      throw new Error(
        `Public OTOMOTO fallback failed with status ${response.status}. Configure APIFY_TOKEN for the Apify collector.`,
      );
    }

    const pageCandidates = collectOtomotoCandidates(
      parseNextData(await response.text()),
    );

    if (pageCandidates.length === 0) {
      break;
    }

    let newCandidates = 0;
    for (const candidate of pageCandidates) {
      const candidateId =
        candidate.listing_id || candidate.id || candidate.listing_url;

      if (!candidateId || candidates.has(String(candidateId))) {
        continue;
      }

      candidates.set(String(candidateId), candidate);
      newCandidates += 1;
    }

    if (newCandidates === 0) {
      break;
    }
  }

  if (candidates.size === 0) {
    throw new Error(
      "Public OTOMOTO fallback could not find listings. Configure APIFY_TOKEN for the Apify collector.",
    );
  }

  return enrichPublicOtomotoGalleries(
    Array.from(candidates.values()).slice(0, maxResults),
  );
}

export function parsePublicOtomotoNextData(
  html: string,
): OtomotoCayenneRawOffer[] {
  return collectOtomotoCandidates(parseNextData(html));
}

export function parsePublicOtomotoDetailImages(html: string): string[] {
  return parsePublicOtomotoDetailData(html).photoUrls;
}

function parsePublicOtomotoDetailData(html: string): {
  photoUrls: string[];
  isAccidentFree?: string;
  isDamaged?: string;
  isImportedCar?: string;
  description?: string;
} {
  const nextData = parseNextData(html);
  const pageProps = getNestedRecord(nextData, ["props", "pageProps"]);
  const advert = getNestedRecord(pageProps, ["advert"]);
  const detailRecord = advert || pageProps || {};

  return {
    photoUrls: pickImages(detailRecord),
    isAccidentFree:
      pickString(detailRecord, ["is_accident_free", "isAccidentFree"]) ||
      pickParameter(detailRecord, "no_accident", "displayValue") ||
      pickParameter(detailRecord, "accident_free", "displayValue") ||
      pickParameter(detailRecord, "accidentFree", "displayValue") ||
      getDamageFreeValue(detailRecord),
    isDamaged:
      pickString(detailRecord, ["is_damaged", "isDamaged", "damaged"]) ||
      pickParameter(detailRecord, "damaged", "displayValue") ||
      pickParameter(detailRecord, "damaged"),
    isImportedCar:
      pickString(detailRecord, ["is_imported_car", "isImported"]) ||
      pickParameter(detailRecord, "is_imported_car", "displayValue") ||
      pickParameter(detailRecord, "is_imported_car") ||
      pickParameterDictValue(detailRecord, "is_imported_car") ||
      pickDeepBooleanString(pageProps, ["isImported", "is_imported_car"]),
    description: pickString(detailRecord, ["description"]),
  };
}

async function enrichPublicOtomotoGalleries(
  offers: OtomotoCayenneRawOffer[],
): Promise<OtomotoCayenneRawOffer[]> {
  const enrichedOffers = [...offers];
  let cursor = 0;

  async function worker() {
    while (cursor < enrichedOffers.length) {
      const index = cursor;
      cursor += 1;
      const offer = enrichedOffers[index];
      const listingUrl = typeof offer.listing_url === "string" ? offer.listing_url : undefined;

      if (!listingUrl) {
        continue;
      }

      const detailData = await fetchPublicOtomotoDetailData(listingUrl);
      if (
        detailData.photoUrls.length === 0 &&
        !detailData.isAccidentFree &&
        !detailData.isDamaged &&
        !detailData.isImportedCar &&
        !detailData.description
      ) {
        continue;
      }

      enrichedOffers[index] = {
        ...offer,
        is_accident_free: detailData.isAccidentFree || offer.is_accident_free,
        is_damaged: detailData.isDamaged || offer.is_damaged,
        is_imported_car: detailData.isImportedCar || offer.is_imported_car,
        description: detailData.description || offer.description,
        photo_urls: mergeUniqueStrings([
          ...normalizeImageList(offer.photo_urls),
          ...detailData.photoUrls,
        ]),
      };
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(detailFetchConcurrency, enrichedOffers.length) },
      () => worker(),
    ),
  );

  return enrichedOffers;
}

async function fetchPublicOtomotoDetailData(
  listingUrl: string,
): Promise<{
  photoUrls: string[];
  isAccidentFree?: string;
  isDamaged?: string;
  isImportedCar?: string;
  description?: string;
}> {
  try {
    const response = await fetch(listingUrl, {
      headers: publicOtomotoHeaders,
      signal: AbortSignal.timeout(detailFetchTimeoutMs),
    });

    if (!response.ok) {
      return { photoUrls: [] };
    }

    return parsePublicOtomotoDetailData(await response.text());
  } catch {
    return { photoUrls: [] };
  }
}

function mergeRawOffers(
  primary: OtomotoCayenneRawOffer[],
  secondary: OtomotoCayenneRawOffer[],
): OtomotoCayenneRawOffer[] {
  const offersById = new Map<string, OtomotoCayenneRawOffer>();

  for (const offer of [...primary, ...secondary]) {
    const offerId = offer.listing_id || offer.id || offer.listing_url;

    if (!offerId || offersById.has(String(offerId))) {
      continue;
    }

    offersById.set(String(offerId), offer);
  }

  return Array.from(offersById.values());
}

function buildPublicSearchPageUrl(searchUrl: string, page: number): string {
  if (page <= 1) {
    return searchUrl;
  }

  const url = new URL(searchUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function parseMaxResults(value: string | undefined): number {
  return Math.min(parsePositiveInteger(value, defaultMaxResults), 500);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getApifyErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as {
    error?: { message?: unknown };
    message?: unknown;
  };

  if (typeof record.error?.message === "string") {
    return record.error.message;
  }

  return typeof record.message === "string" ? record.message : undefined;
}

function parseNextData(html: string): unknown {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );

  if (!match) {
    throw new Error("Public OTOMOTO fallback could not find __NEXT_DATA__.");
  }

  return JSON.parse(match[1]);
}

function collectOtomotoCandidates(root: unknown): OtomotoCayenneRawOffer[] {
  const candidates = new Map<string, OtomotoCayenneRawOffer>();
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.data === "string" && looksLikeJson(record.data)) {
      try {
        visit(JSON.parse(record.data));
      } catch {
        // Ignore non-JSON strings in page state.
      }
    }

    const mapped = mapPublicOtomotoRecord(record);
    if (mapped?.listing_id && !candidates.has(String(mapped.listing_id))) {
      candidates.set(String(mapped.listing_id), mapped);
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  }

  visit(root);
  return Array.from(candidates.values());
}

function mapPublicOtomotoRecord(
  record: Record<string, unknown>,
): OtomotoCayenneRawOffer | undefined {
  const listingId = pickString(record, [
    "listing_id",
    "listingId",
    "advertId",
    "adId",
    "id",
  ]);
  const listingUrl = pickString(record, [
    "listing_url",
    "listingUrl",
    "url",
    "href",
    "absoluteUrl",
  ]);
  const title = pickString(record, ["title", "name", "displayName"]);
  const price = pickNumber(record, [
    "price",
    "priceValue",
    "amount",
    "value",
    "grossPrice",
  ]);

  if (!listingId || !listingUrl || !price || !looksLikeCayenne(record, title)) {
    return undefined;
  }

  return {
    listing_id: listingId,
    listing_url: absolutizeOtomotoUrl(listingUrl),
    title,
    make: pickString(record, ["make", "makeName", "brand"]) || pickParameter(record, "make"),
    model:
      pickString(record, ["model", "modelName"]) || pickParameter(record, "model"),
    version:
      pickString(record, ["version", "versionName", "trim"]) ||
      pickParameter(record, "version"),
    year:
      pickNumber(record, ["year", "productionYear"]) ||
      normalizeNumber(pickParameter(record, "year")),
    price,
    currency: pickCurrency(record) || "PLN",
    mileage_km:
      pickNumber(record, ["mileage_km", "mileageKm", "mileage"]) ||
      normalizeNumber(pickParameter(record, "mileage")),
    fuel_type:
      pickString(record, ["fuel_type", "fuelType"]) ||
      pickParameter(record, "fuel_type", "displayValue"),
    transmission:
      pickString(record, ["transmission", "gearbox"]) ||
      pickParameter(record, "gearbox", "displayValue"),
    engine_power_hp:
      pickNumber(record, [
        "engine_power_hp",
        "enginePowerHp",
        "power",
        "powerHp",
      ]) || normalizeNumber(pickParameter(record, "engine_power")),
    engine_size_cc:
      pickNumber(record, [
        "engine_size_cc",
        "engineSizeCc",
        "engineCapacity",
        "engineCapacityCc",
      ]) || normalizeNumber(pickParameter(record, "engine_capacity")),
    location: pickLocationName(record, "city") || pickString(record, ["location", "city"]),
    region:
      pickLocationName(record, "region") ||
      pickString(record, ["region", "province", "voivodeship"]),
    seller_type: pickString(record, ["seller_type", "sellerType"]),
    seller_name:
      pickString(record, ["seller_name", "sellerName"]) ||
      pickNestedString(record, ["seller", "name"]) ||
      pickNestedString(record, ["sellerLink", "name"]),
    description: pickString(record, ["description"]),
    is_imported_car:
      pickString(record, ["is_imported_car", "isImported"]) ||
      pickParameter(record, "is_imported_car", "displayValue") ||
      pickParameter(record, "is_imported_car") ||
      pickParameterDictValue(record, "is_imported_car") ||
      pickDeepBooleanString(record, ["isImported", "is_imported_car"]),
    has_vat_invoice: hasAnySignal(record, [
      "INVOICE_ISSUED",
      "faktura vat",
      "vat",
    ]),
    financing_available: hasAnySignal(record, [
      "finansowanie",
      "financing",
      "leasing",
      "kredyt",
    ]),
    is_accident_free:
      pickString(record, ["is_accident_free", "isAccidentFree"]) ||
      pickParameter(record, "no_accident", "displayValue") ||
      pickParameter(record, "accident_free", "displayValue") ||
      pickParameter(record, "accidentFree", "displayValue") ||
      getDamageFreeValue(record),
    is_damaged:
      pickString(record, ["is_damaged", "isDamaged", "damaged"]) ||
      pickParameter(record, "damaged") ||
      pickParameter(record, "condition", "displayValue"),
    photo_urls: pickImages(record),
    posted_date: pickString(record, [
      "posted_date",
      "postedDate",
      "createdAt",
      "created_at",
    ]),
  };
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function looksLikeCayenne(
  record: Record<string, unknown>,
  title?: string,
): boolean {
  const haystack = [
    title,
    pickString(record, ["make", "makeName", "brand"]),
    pickString(record, ["model", "modelName"]),
    pickString(record, ["url", "href", "listing_url"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes("porsche") && haystack.includes("cayenne");
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function pickNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = normalizeNumber(record[key]);

    if (value !== undefined) {
      return value;
    }

    const nested = record[key];
    if (nested && typeof nested === "object") {
      const nestedValue = pickNumber(nested as Record<string, unknown>, [
        "value",
        "amount",
        "gross",
        "number",
        "units",
      ]);

      if (nestedValue !== undefined) {
        return nestedValue;
      }
    }
  }

  return undefined;
}

function pickCurrency(record: Record<string, unknown>): string | undefined {
  return (
    pickString(record, ["currency", "currencyCode"]) ||
    pickNestedString(record, ["price", "amount", "currencyCode"]) ||
    pickNestedString(record, ["price", "currencyCode"])
  );
}

function pickParameter(
  record: Record<string, unknown>,
  key: string,
  valueKey: "value" | "displayValue" = "value",
): string | undefined {
  const parameters = record.parameters;

  if (!Array.isArray(parameters)) {
    return undefined;
  }

  for (const parameter of parameters) {
    if (!parameter || typeof parameter !== "object") {
      continue;
    }

    const parameterRecord = parameter as Record<string, unknown>;
    if (parameterRecord.key === key) {
      return pickString(parameterRecord, [valueKey]);
    }
  }

  return undefined;
}

function getDamageFreeValue(record: Record<string, unknown>): string | undefined {
  const damagedValue =
    pickString(record, ["damaged", "is_damaged", "isDamaged"]) ||
    pickParameter(record, "damaged", "displayValue") ||
    pickParameter(record, "damaged") ||
    pickParameterDictValue(record, "damaged");

  if (!damagedValue) {
    return undefined;
  }

  const normalized = damagedValue.trim().toLowerCase();

  if (["0", "false", "no", "nie"].includes(normalized)) {
    return "tak";
  }

  if (["1", "true", "yes", "tak"].includes(normalized)) {
    return "nie";
  }

  return undefined;
}

function pickParameterDictValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const parametersDict = record.parametersDict;

  if (!parametersDict || typeof parametersDict !== "object") {
    return undefined;
  }

  const entry = (parametersDict as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  const values = (entry as Record<string, unknown>).values;
  if (!Array.isArray(values)) {
    return undefined;
  }

  for (const value of values) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const valueRecord = value as Record<string, unknown>;
    const pickedValue = pickString(valueRecord, ["label", "value"]);

    if (pickedValue) {
      return pickedValue;
    }
  }

  return undefined;
}

function pickDeepBooleanString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  const stack: unknown[] = [record];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const value = stack.pop();

    if (!value || typeof value !== "object" || seen.has(value)) {
      continue;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }

    const valueRecord = value as Record<string, unknown>;

    for (const key of keys) {
      const picked = valueRecord[key];

      if (typeof picked === "boolean") {
        return String(picked);
      }

      if (typeof picked === "number" || typeof picked === "string") {
        const normalized = String(picked).trim();

        if (normalized) {
          return normalized;
        }
      }
    }

    stack.push(...Object.values(valueRecord));
  }

  return undefined;
}

function hasAnySignal(
  record: Record<string, unknown>,
  needles: string[],
): boolean {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());
  const stack: unknown[] = [
    record.price,
    record.badges,
    record.priceBadges,
    record.features,
    record.parameters,
    record.valueAddedServices,
    record.services,
    record.labels,
  ];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const value = stack.pop();

    if (!value || seen.has(value)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).toLowerCase();
      if (normalizedNeedles.some((needle) => normalized.includes(needle))) {
        return true;
      }
      continue;
    }

    if (typeof value !== "object") {
      continue;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      stack.push(...value);
    } else {
      stack.push(...Object.values(value as Record<string, unknown>));
    }
  }

  return false;
}

function pickLocationName(
  record: Record<string, unknown>,
  key: "city" | "region",
): string | undefined {
  return (
    pickNestedString(record, ["location", key, "name"]) ||
    pickNestedString(record, ["location", key])
  );
}

function pickNestedString(
  record: Record<string, unknown>,
  path: string[],
): string | undefined {
  let current: unknown = record;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current.trim()
    ? current.trim()
    : undefined;
}

function getNestedRecord(
  record: unknown,
  path: string[],
): Record<string, unknown> | undefined {
  let current: unknown = record;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
  }

  return undefined;
}

function pickImages(record: Record<string, unknown>): string[] {
  const directImages = record.photo_urls ?? record.image_urls ?? record.images;

  if (Array.isArray(directImages)) {
    return normalizeImageList(directImages);
  }

  if (directImages && typeof directImages === "object") {
    const nestedImages = normalizeImageList(directImages);
    if (nestedImages.length > 0) {
      return nestedImages;
    }
  }

  const image = pickString(record, ["image", "imageUrl", "thumbnail", "photo"]);
  const thumbnail =
    image ||
    pickNestedString(record, ["thumbnail", "x2"]) ||
    pickNestedString(record, ["thumbnail", "x1"]);
  return thumbnail ? [thumbnail] : [];
}

function normalizeImageList(value: unknown): string[] {
  const urls: string[] = [];
  const seen = new Set<unknown>();

  function visit(item: unknown) {
    if (!item || seen.has(item)) {
      return;
    }

    if (typeof item === "string") {
      if (isHttpImageUrl(item)) {
        urls.push(item);
      }
      return;
    }

    if (typeof item !== "object") {
      return;
    }

    seen.add(item);

    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }

    const record = item as Record<string, unknown>;
    const directUrl = pickString(record, [
      "url",
      "uri",
      "src",
      "medium",
      "large",
      "x2",
      "x1",
    ]);

    if (directUrl && isHttpImageUrl(directUrl)) {
      urls.push(directUrl);
    }

    for (const key of ["photos", "images", "image_urls", "thumbnails"]) {
      visit(record[key]);
    }
  }

  visit(value);
  return mergeUniqueStrings(urls);
}

function isHttpImageUrl(value: string): boolean {
  return value.startsWith("http") && !value.includes("fb-image200x200");
}

function mergeUniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function absolutizeOtomotoUrl(value: string): string {
  if (value.startsWith("http")) {
    return value;
  }

  return new URL(value, "https://www.otomoto.pl").toString();
}
