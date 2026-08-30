import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCayenneOfferView,
  applyCayenneDealScores,
  formatListingAge,
  getCayenneGeneration,
  getCayenneIdentityKey,
  normalizeOtomotoCayenneOffer,
  shouldCreateCayennePriceSnapshot,
  type LeanCayenneOffer,
} from "../lib/cayenne.ts";
import {
  parsePublicOtomotoDetailImages,
  parsePublicOtomotoNextData,
} from "../lib/sources/otomoto-cayenne.ts";

test("normalizes OTOMOTO Cayenne output into the internal offer shape", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url:
      "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne-ID6I5XQU.html",
    title: "Porsche Cayenne 3.0",
    year: 2020,
    price: "269900",
    currency: "PLN",
    mileage_km: "82450",
    fuel_type: "Benzyna",
    transmission: "Automatyczna",
    engine_power_hp: "340",
    engine_size_cc: "2995",
    location: "Warszawa",
    region: "Mazowieckie",
    seller_type: "dealer",
    photo_urls: [
      "https://example.com/a.jpg",
      "https://example.com/a.jpg",
      { url: "https://example.com/b.jpg" },
    ],
    posted_date: "2026-06-01T21:24:15Z",
  });

  assert.ok(offer);
  assert.equal(offer.source, "otomoto");
  assert.equal(offer.externalId, "6148377492");
  assert.equal(offer.price, 269900);
  assert.equal(offer.year, 2020);
  assert.equal(offer.mileageKm, 82450);
  assert.equal(offer.enginePowerHp, 340);
  assert.equal(offer.engineSizeCc, 2995);
  assert.equal(offer.hasVatInvoice, false);
  assert.equal(offer.hasFinancing, false);
  assert.equal(offer.isDamaged, false);
  assert.equal(getCayenneGeneration(offer.year), "current");
  assert.deepEqual(offer.imageUrls, [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg",
  ]);
  assert.equal(offer.postedAt?.toISOString(), "2026-06-01T21:24:15.000Z");
});

test("skips OTOMOTO rows without required identity, URL, or price", () => {
  assert.equal(
    normalizeOtomotoCayenneOffer({
      listing_id: "1",
      title: "Porsche Cayenne",
      price: 200000,
    }),
    undefined,
  );
  assert.equal(
    normalizeOtomotoCayenneOffer({
      listing_id: "1",
      listing_url: "https://example.com",
      price: 0,
    }),
    undefined,
  );
});

test("normalizes damaged OTOMOTO flag", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 120000,
    damaged: "Tak",
  });

  assert.ok(offer);
  assert.equal(offer.isDamaged, true);
});

test("uses non-damaged OTOMOTO flag as accident-free fallback", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 120000,
    damaged: "Nie",
  });

  assert.ok(offer);
  assert.equal(offer.isDamaged, false);
  assert.equal(offer.isAccidentFree, true);
});

test("marks cars outside Poland as import offers", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 129000,
    is_imported_car: "true",
    description:
      "Auto jest w trakcie transportu z USA. Cena pod dom zawiera clo i VAT.",
  });

  assert.ok(offer);
  assert.equal(offer.isImportOffer, true);
});

test("does not mark Polish-stock cars as import offers", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 199999,
    is_imported_car: "false",
    description:
      "Auto zakupione jako nowe w polskim salonie dealera Porsche. Samochod znajduje sie w Poznaniu.",
  });

  assert.ok(offer);
  assert.equal(offer.isImportOffer, false);
});

test("normalizes leasing-friendly Cayenne fields", () => {
  const offer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 120000,
    has_vat_invoice: "tak",
    financing_available: "tak",
    is_accident_free: "tak",
  });

  assert.ok(offer);
  assert.equal(offer.hasVatInvoice, true);
  assert.equal(offer.hasFinancing, true);
  assert.equal(offer.isAccidentFree, true);
});

test("classifies Cayenne generations by production year", () => {
  assert.equal(getCayenneGeneration(2026), "current");
  assert.equal(getCayenneGeneration(2018), "current");
  assert.equal(getCayenneGeneration(2017), "current");
  assert.equal(getCayenneGeneration(2016), "previous");
  assert.equal(getCayenneGeneration(2010), "previous");
  assert.equal(getCayenneGeneration(2009), "other");
  assert.equal(getCayenneGeneration(undefined), "unknown");
});

test("adds generation to Cayenne offer view", () => {
  assert.equal(
    buildCayenneOfferView(createLeanOffer({ year: 2017 }), []).generation,
    "current",
  );
});

test("calculates Cayenne price delta from latest price snapshots", () => {
  const view = buildCayenneOfferView(createLeanOffer({ price: 259900 }), [
    {
      id: "snapshot-1",
      fetchedAt: "2026-06-20T00:00:00.000Z",
      price: 269900,
      currency: "PLN",
    },
    {
      id: "snapshot-2",
      fetchedAt: "2026-06-21T00:00:00.000Z",
      price: 259900,
      currency: "PLN",
    },
  ]);

  assert.equal(view.hasPriceChanged, true);
  assert.ok(view.priceDelta);
  assert.equal(view.priceDelta.amount, -10000);
  assert.equal(view.priceDelta.previousPrice, 269900);
  assert.equal(view.priceDelta.latestPrice, 259900);
  assert.equal(view.priceDelta.percent, (-10000 / 269900) * 100);
});

test("scores Cayenne offers by VAT financing, price, accident status and mileage", () => {
  const scored = applyCayenneDealScores(
    [
      buildCayenneOfferView(
        createLeanOffer({
          price: 180000,
          mileageKm: 40000,
          hasVatInvoice: true,
          hasFinancing: true,
          isAccidentFree: true,
        }),
        [],
      ),
      buildCayenneOfferView(
        createLeanOffer({
          _id: "507f1f77bcf86cd799439012" as unknown as LeanCayenneOffer["_id"],
          price: 240000,
          mileageKm: 140000,
          hasVatInvoice: false,
          hasFinancing: false,
          isAccidentFree: false,
        }),
        [],
      ),
    ],
    {
      vatFinancing: 0.25,
      price: 0.25,
      accidentFree: 0.25,
      mileage: 0.25,
    },
  );

  assert.equal(scored[0].dealScore?.score, 100);
  assert.equal(scored[1].dealScore?.score, 0);
});

test("caps suspicious cheap imported Cayenne deal scores", () => {
  const riskyOffer = normalizeOtomotoCayenneOffer({
    listing_id: "6148708405",
    listing_url:
      "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne-ID6I7lVd.html",
    title: "Porsche Cayenne Tiptronic S",
    price: 94500,
    year: 2019,
    mileage_km: 53412,
    damaged: "Nie",
    description:
      "Samochod importowany, wyposazony w mocny silnik benzynowy 3.0. Zapraszam do kontaktu.",
  });
  const regularOffer = normalizeOtomotoCayenneOffer({
    listing_id: "6148377492",
    listing_url: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    title: "Porsche Cayenne",
    price: 240000,
    year: 2019,
    mileage_km: 120000,
    has_vat_invoice: "tak",
    financing_available: "tak",
    is_accident_free: "tak",
  });

  assert.ok(riskyOffer);
  assert.ok(regularOffer);
  assert.equal(riskyOffer.hasDealRisk, true);

  const scored = applyCayenneDealScores([
    buildCayenneOfferView(createLeanOffer(riskyOffer), []),
    buildCayenneOfferView(createLeanOffer(regularOffer), []),
  ]);

  assert.equal(scored[0].dealScore?.score, 45);
  assert.ok(
    scored[0].dealScore?.reasons.includes(
      "Ryzyko: bardzo niska cena, import i brak VAT/finansowania",
    ),
  );
});

test("builds listing age from OTOMOTO publication date when present", () => {
  const offer = createLeanOffer({
    postedAt: new Date("2026-06-10T00:00:00.000Z"),
    firstSeenAt: new Date("2026-06-20T00:00:00.000Z"),
  });

  const view = buildCayenneOfferView(offer, []);

  assert.equal(view.listingAgeBasis, "published");
  assert.equal(view.listingAgeLabel, formatListingAge(offer.postedAt as Date));
});

test("falls back to first-seen age when OTOMOTO publication date is missing", () => {
  const offer = createLeanOffer({
    postedAt: undefined,
    firstSeenAt: new Date("2026-06-20T00:00:00.000Z"),
  });

  const view = buildCayenneOfferView(offer, []);

  assert.equal(view.listingAgeBasis, "firstSeen");
  assert.equal(view.listingAgeLabel, formatListingAge(offer.firstSeenAt));
});

test("deduplicates Cayenne offers by source and external id", () => {
  assert.equal(
    getCayenneIdentityKey({
      source: "otomoto",
      externalId: "6148377492",
    }),
    "otomoto:6148377492",
  );
});

test("creates price snapshots only when price or currency changes", () => {
  assert.equal(
    shouldCreateCayennePriceSnapshot(undefined, {
      price: 269900,
      currency: "PLN",
    }),
    true,
  );
  assert.equal(
    shouldCreateCayennePriceSnapshot(
      { price: 269900, currency: "PLN" },
      { price: 269900, currency: "PLN" },
    ),
    false,
  );
  assert.equal(
    shouldCreateCayennePriceSnapshot(
      { price: 269900, currency: "PLN" },
      { price: 259900, currency: "PLN" },
    ),
    true,
  );
});

test("parses OTOMOTO public Next.js data fallback", () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json" nonce="abc">{"props":{"pageProps":{"urqlState":{"1":{"data":"{\\"advertSearch\\":{\\"edges\\":[{\\"node\\":{\\"id\\":\\"6145660336\\",\\"title\\":\\"Porsche Cayenne\\",\\"createdAt\\":\\"2026-06-02T17:17:36Z\\",\\"url\\":\\"https://www.otomoto.pl/osobowe/oferta/porsche-cayenne-ID6HUyZO.html\\",\\"location\\":{\\"city\\":{\\"name\\":\\"Warszawa\\"},\\"region\\":{\\"name\\":\\"Mazowieckie\\"}},\\"price\\":{\\"amount\\":{\\"units\\":954308,\\"currencyCode\\":\\"PLN\\"}},\\"parameters\\":[{\\"key\\":\\"make\\",\\"value\\":\\"porsche\\",\\"displayValue\\":\\"Porsche\\"},{\\"key\\":\\"model\\",\\"value\\":\\"cayenne\\",\\"displayValue\\":\\"Cayenne\\"},{\\"key\\":\\"year\\",\\"value\\":\\"2025\\",\\"displayValue\\":\\"2025\\"},{\\"key\\":\\"mileage\\",\\"value\\":\\"1\\",\\"displayValue\\":\\"1 km\\"},{\\"key\\":\\"fuel_type\\",\\"value\\":\\"hybrid\\",\\"displayValue\\":\\"Hybryda\\"},{\\"key\\":\\"gearbox\\",\\"value\\":\\"automatic\\",\\"displayValue\\":\\"Automatyczna\\"},{\\"key\\":\\"engine_capacity\\",\\"value\\":\\"3996\\",\\"displayValue\\":\\"3996 cm3\\"},{\\"key\\":\\"engine_power\\",\\"value\\":\\"599\\",\\"displayValue\\":\\"599 KM\\"}],\\"thumbnail\\":{\\"x2\\":\\"https://example.com/cayenne.jpg\\"},\\"sellerLink\\":{\\"name\\":\\"Porsche Centrum Warszawa\\"}}}]}}"}}}}}</script></body></html>`;
  const offers = parsePublicOtomotoNextData(html);

  assert.equal(offers.length, 1);
  assert.deepEqual(
    {
      listing_id: offers[0].listing_id,
      listing_url: offers[0].listing_url,
      title: offers[0].title,
      make: offers[0].make,
      model: offers[0].model,
      year: offers[0].year,
      price: offers[0].price,
      currency: offers[0].currency,
      mileage_km: offers[0].mileage_km,
      fuel_type: offers[0].fuel_type,
      transmission: offers[0].transmission,
      engine_power_hp: offers[0].engine_power_hp,
      engine_size_cc: offers[0].engine_size_cc,
      location: offers[0].location,
      region: offers[0].region,
      seller_name: offers[0].seller_name,
      photo_urls: offers[0].photo_urls,
      has_vat_invoice: offers[0].has_vat_invoice,
      posted_date: offers[0].posted_date,
    },
    {
    listing_id: "6145660336",
    listing_url:
      "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne-ID6HUyZO.html",
    title: "Porsche Cayenne",
    make: "porsche",
    model: "cayenne",
    year: 2025,
    price: 954308,
    currency: "PLN",
    mileage_km: 1,
    fuel_type: "Hybryda",
    transmission: "Automatyczna",
    engine_power_hp: 599,
    engine_size_cc: 3996,
    location: "Warszawa",
    region: "Mazowieckie",
    seller_name: "Porsche Centrum Warszawa",
    photo_urls: ["https://example.com/cayenne.jpg"],
    has_vat_invoice: false,
    posted_date: "2026-06-02T17:17:36Z",
    },
  );
});

test("parses OTOMOTO detail gallery images", () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"advert":{"images":{"photos":[{"url":"https://ireland.apollo.olxcdn.com/v1/files/a/image"},{"url":"https://ireland.apollo.olxcdn.com/v1/files/b/image"},{"url":"https://ireland.apollo.olxcdn.com/v1/files/a/image"}],"thumbnails":[{"url":"https://ireland.apollo.olxcdn.com/v1/files/c/image;s=148x110"}]}}}}}</script></body></html>`;

  assert.deepEqual(parsePublicOtomotoDetailImages(html), [
    "https://ireland.apollo.olxcdn.com/v1/files/a/image",
    "https://ireland.apollo.olxcdn.com/v1/files/b/image",
    "https://ireland.apollo.olxcdn.com/v1/files/c/image;s=148x110",
  ]);
});

function createLeanOffer(
  overrides: Partial<LeanCayenneOffer> = {},
): LeanCayenneOffer {
  return {
    _id: "507f1f77bcf86cd799439011" as unknown as LeanCayenneOffer["_id"],
    source: "otomoto",
    externalId: "6148377492",
    title: "Porsche Cayenne",
    offerUrl: "https://www.otomoto.pl/osobowe/oferta/porsche-cayenne.html",
    imageUrls: [],
    price: 269900,
    currency: "PLN",
    firstSeenAt: new Date("2026-06-20T00:00:00.000Z"),
    lastSeenAt: new Date("2026-06-21T00:00:00.000Z"),
    isAvailable: true,
    ...overrides,
  };
}
