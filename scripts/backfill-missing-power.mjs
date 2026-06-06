import mongoose from "mongoose";

const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/carCollectorDB";
const arvalBaseUrl =
  process.env.ARVAL_API_BASE_URL ||
  "https://arval-prod-euw-appservice-portalapi.azurewebsites.net";
const arvalPath = process.env.ARVAL_ANNOUNCEMENTS_PATH || "/api/Announcements/17";
const concurrency = Number(process.env.POWER_BACKFILL_CONCURRENCY || 8);
const requestTimeoutMs = Number(process.env.POWER_BACKFILL_TIMEOUT_MS || 8000);

await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });

const db = mongoose.connection.db;
const offers = await db
  .collection("caroffers")
  .find(
    {
      source: "arval",
      purchaseOption: { $in: ["release", "sale"] },
      $or: [
        { "details.powerHp": { $exists: false } },
        { "details.powerHp": null },
      ],
    },
    {
      projection: {
        _id: 1,
        externalId: 1,
        rawData: 1,
      },
    },
  )
  .toArray();

const stats = {
  checked: offers.length,
  updated: 0,
  fromStoredData: 0,
  fromArvalDetails: 0,
  unavailable: 0,
  missingPower: 0,
  failed: 0,
};

let index = 0;

await Promise.all(
  Array.from({ length: Math.min(concurrency, offers.length) }, async () => {
    while (index < offers.length) {
      const offer = offers[index++];

      try {
        const storedPowerHp = normalizePowerHp(offer.rawData);

        if (storedPowerHp) {
          await updatePower(offer, storedPowerHp, offer.rawData);
          stats.updated += 1;
          stats.fromStoredData += 1;
          continue;
        }

        const details = await fetchArvalDetails(offer.externalId);

        if (!details) {
          stats.unavailable += 1;
          continue;
        }

        const powerHp = normalizePowerHp(details);

        if (!powerHp) {
          stats.missingPower += 1;
          continue;
        }

        await updatePower(offer, powerHp, details);
        stats.updated += 1;
        stats.fromArvalDetails += 1;
      } catch {
        stats.failed += 1;
      }
    }
  }),
);

console.log(JSON.stringify(stats, null, 2));

await mongoose.disconnect();

async function fetchArvalDetails(externalId) {
  const detailUrl = new URL(
    `${arvalPath.replace(/\/$/, "")}/${externalId}`,
    arvalBaseUrl,
  );

  const response = await fetch(detailUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Arval detail request failed with status ${response.status}`);
  }

  return response.json();
}

async function updatePower(offer, powerHp, rawData) {
  await db.collection("caroffers").updateOne(
    { _id: offer._id },
    {
      $set: {
        "details.powerHp": powerHp,
        rawData: {
          ...(isRecord(offer.rawData) ? offer.rawData : {}),
          ...(isRecord(rawData) ? rawData : {}),
        },
      },
    },
  );
}

function normalizePowerHp(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  return (
    toPositiveInteger(value.horsePower) ||
    kilowattsToHorsePower(value.power) ||
    parsePowerHp(value.trim)
  );
}

function kilowattsToHorsePower(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.round(number * 1.359621617)
    : undefined;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function parsePowerHp(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const matches = Array.from(
    value.matchAll(/(\d{2,4}(?:[.,]\d+)?)\s*(kW|KM|HP)\b/gi),
  );
  const match = matches.at(-1);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return unit === "kw" ? Math.round(amount * 1.359621617) : Math.round(amount);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
