import type { ArvalAnnouncement, PurchaseOption } from "../types";

const defaultArvalBaseUrl = "https://arval-prod-euw-appservice-portalapi.azurewebsites.net";
const detailConcurrency = 8;

export interface FetchArvalAnnouncementsOptions {
  pageNumber?: number;
  pageSize?: number;
  purchaseOption?: PurchaseOption;
}

export async function fetchArvalAnnouncements({
  pageNumber = 1,
  pageSize = 400,
  purchaseOption = "release",
}: FetchArvalAnnouncementsOptions = {}): Promise<ArvalAnnouncement[]> {
  const baseUrl = process.env.ARVAL_API_BASE_URL || defaultArvalBaseUrl;
  const path = process.env.ARVAL_ANNOUNCEMENTS_PATH || "/api/Announcements/17";
  const url = new URL(path, baseUrl);

  url.search = new URLSearchParams({
    orderBy: "createdAt|desc",
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
    priceType: "net",
    purchaseOption,
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Arval request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const announcements = payload?.announcements?.announcements || [];
  return enrichAnnouncementsWithDetails(announcements, baseUrl, path);
}

export async function fetchArvalAnnouncementDetailsById(
  id: string | number,
): Promise<ArvalAnnouncement> {
  const baseUrl = process.env.ARVAL_API_BASE_URL || defaultArvalBaseUrl;
  const path = process.env.ARVAL_ANNOUNCEMENTS_PATH || "/api/Announcements/17";
  return fetchArvalAnnouncementDetails(baseUrl, path, id);
}

async function enrichAnnouncementsWithDetails(
  announcements: ArvalAnnouncement[],
  baseUrl: string,
  path: string,
): Promise<ArvalAnnouncement[]> {
  return mapWithConcurrency(announcements, detailConcurrency, async (announcement) => {
    try {
      const details = await fetchArvalAnnouncementDetails(
        baseUrl,
        path,
        announcement.id,
      );

      return mergeAnnouncementDetails(announcement, details);
    } catch {
      return announcement;
    }
  });
}

function mergeAnnouncementDetails(
  announcement: ArvalAnnouncement,
  details: ArvalAnnouncement,
): ArvalAnnouncement {
  return {
    ...details,
    ...announcement,
    images:
      details.images && details.images.length > 0
        ? details.images
        : announcement.images,
    mainImage: announcement.mainImage || details.mainImage,
    mainUrl: announcement.mainUrl || details.mainUrl,
  };
}

async function fetchArvalAnnouncementDetails(
  baseUrl: string,
  path: string,
  id: string | number,
): Promise<ArvalAnnouncement> {
  const detailUrl = new URL(`${path.replace(/\/$/, "")}/${id}`, baseUrl);
  const response = await fetch(detailUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Arval detail request for ${id} failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<ArvalAnnouncement>;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
