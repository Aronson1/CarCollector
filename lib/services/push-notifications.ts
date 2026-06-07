import webPush, { type PushSubscription as WebPushSubscription } from "web-push";
import { connectToDatabase } from "../db";
import { CarOffer, PushSubscription } from "../models/car";
import type { CarOfferView } from "../types";
import { getCars } from "./cars";
import { getAppSettings } from "./settings";

interface BrowserPushSubscription {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

interface DealPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface SendDealPushOptions {
  offerIds?: string[];
}

let webPushConfigured = false;

export async function savePushSubscription(
  value: unknown,
  userAgent?: string | null,
) {
  const subscription = parseBrowserPushSubscription(value);

  if (!subscription) {
    return null;
  }

  await connectToDatabase();

  const saved = await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: subscription.keys,
        userAgent: userAgent || undefined,
        lastSeenAt: new Date(),
      },
    },
    { new: true, upsert: true },
  ).lean();

  return {
    endpoint: saved.endpoint,
  };
}

export async function sendUsedRentalDealPushNotifications(
  options: SendDealPushOptions = {},
): Promise<number> {
  if (options.offerIds && options.offerIds.length === 0) {
    return 0;
  }

  if (!configureWebPush()) {
    return 0;
  }

  const settings = await getAppSettings();
  const allowedOfferIds = options.offerIds
    ? new Set(options.offerIds)
    : undefined;
  const { cars } = await getCars({
    purchaseOption: "release",
    pageSize: "all",
    sort: "dealScoreDesc",
  });
  const candidates = cars.filter(
    (car) =>
      (!allowedOfferIds || allowedOfferIds.has(car.id)) &&
      (car.dealScore?.score ?? 0) >= settings.dealPushThreshold,
  );

  if (candidates.length === 0) {
    return 0;
  }

  const alreadyNotified = await getAlreadyNotifiedOfferIds(candidates);
  let sent = 0;

  for (const car of candidates) {
    if (alreadyNotified.has(car.id)) {
      continue;
    }

    const delivered = await sendDealPushNotification(car);

    if (delivered > 0) {
      sent += delivered;
      await markDealPushNotified(car);
    }
  }

  return sent;
}

async function getAlreadyNotifiedOfferIds(
  cars: CarOfferView[],
): Promise<Set<string>> {
  const notifiedOffers = await CarOffer.find(
    {
      _id: { $in: cars.map((car) => car.id) },
      dealPushNotifiedAt: { $exists: true },
    },
    { _id: 1 },
  ).lean();

  return new Set(notifiedOffers.map((offer) => String(offer._id)));
}

async function sendDealPushNotification(car: CarOfferView): Promise<number> {
  const subscriptions = await PushSubscription.find({}).lean();

  if (subscriptions.length === 0) {
    return 0;
  }

  const payload = JSON.stringify(getDealPushPayload(car));
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!subscription.keys) {
        return;
      }

      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? null,
            keys: subscription.keys,
          },
          payload,
        );
        delivered += 1;
      } catch (error) {
        if (isExpiredPushSubscriptionError(error)) {
          await PushSubscription.deleteOne({ _id: subscription._id });
          return;
        }

        console.error("Deal push notification failed", error);
      }
    }),
  );

  return delivered;
}

async function markDealPushNotified(car: CarOfferView) {
  await CarOffer.updateOne(
    { _id: car.id },
    {
      $set: {
        dealPushNotifiedAt: new Date(),
        dealPushNotifiedScore: car.dealScore?.score ?? null,
      },
    },
  );
}

function getDealPushPayload(car: CarOfferView): DealPushPayload {
  const price = car.latestPrices.find((value) => value > 0);
  const score = car.dealScore?.score ?? 0;
  const parts = [
    `Okazja ${score}/100`,
    price ? `${formatPrice(price)} netto` : undefined,
    car.details.powerHp ? `${car.details.powerHp} KM` : undefined,
  ].filter(Boolean);

  return {
    title: "Najem używane: dobra okazja",
    body: `${car.fullName} - ${parts.join(" | ")}`,
    url: car.offerUrl || `/?purchaseOption=release&id=${car.externalId}`,
    tag: `used-rental-deal-${car.externalId}`,
  };
}

function parseBrowserPushSubscription(
  value: unknown,
): WebPushSubscription | null {
  const subscription = value as BrowserPushSubscription | null;

  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number"
        ? subscription.expirationTime
        : null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

function configureWebPush(): boolean {
  if (webPushConfigured) {
    return true;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
  return true;
}

function isExpiredPushSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 0,
  }).format(value);
}
