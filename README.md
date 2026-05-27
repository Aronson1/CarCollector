# Car Collector

Private Next.js panel for collecting Arval car offers, storing price snapshots in MongoDB, and reviewing price history.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:local
npm run dev
```

Set `MONGODB_URI` to MongoDB Atlas for hosted data, or leave it unset locally to use `mongodb://127.0.0.1:27017/carCollectorDB`.

## API

- `GET /api/cars` returns car offers with price history. Supported filters: `purchaseOption`, `id`, `brand`, `model`, `changedOnly`.
- `GET /api/cars/filters` returns available brands and models for autocomplete filters. Pass `purchaseOption=release|sale` to scope options.
- `GET /api/collector/run` fetches both Arval release and sale offers for cron usage. It requires `x-cron-secret` or `Authorization: Bearer <CRON_SECRET>`.
- `POST /api/collector/run` fetches one mode from the app. Send `{ "purchaseOption": "release" }` or `{ "purchaseOption": "sale" }`.

## Migration

Import old local data into the hosted database from the JSON backup:

```bash
$env:MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/carCollectorDB"
$env:LEGACY_CARS_JSON="backup/carCollectorDB.cars.json"
npm run migrate:legacy
npm run images:backfill
```

The script reads legacy `cars` documents, upserts `CarOffer` records, and writes deduplicated `PriceSnapshot` entries.

## Deploy

Deploy the Next.js app to Vercel and configure:

- `MONGODB_URI`
- `CRON_SECRET`
- optional `ARVAL_API_BASE_URL`
- optional `ARVAL_ANNOUNCEMENTS_PATH`

`vercel.json` schedules the collector once per day at `08:00 UTC`.

Vercel Cron invokes `GET /api/collector/run` and sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is configured in the Vercel project environment variables.

For MongoDB Atlas:

- create a cluster and database user,
- set Network Access to allow Vercel connections; for the initial Vercel serverless setup use `0.0.0.0/0` with a strong database password,
- set `MONGODB_URI` in Vercel to the Atlas connection string.
