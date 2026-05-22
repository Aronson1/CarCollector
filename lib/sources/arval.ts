import type { ArvalAnnouncement } from "../types";

const defaultArvalBaseUrl = "https://arval-prod-euw-appservice-portalapi.azurewebsites.net";

export interface FetchArvalAnnouncementsOptions {
  pageSize?: number;
}

export async function fetchArvalAnnouncements({
  pageSize = 400,
}: FetchArvalAnnouncementsOptions = {}): Promise<ArvalAnnouncement[]> {
  const baseUrl = process.env.ARVAL_API_BASE_URL || defaultArvalBaseUrl;
  const path = process.env.ARVAL_ANNOUNCEMENTS_PATH || "/api/Announcements/17";
  const url = new URL(path, baseUrl);

  url.search = new URLSearchParams({
    orderBy: "createdAt|desc",
    pageNumber: "1",
    pageSize: String(pageSize),
    priceType: "net",
    purchaseOption: "release",
  }).toString();

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Arval request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload?.announcements?.announcements || [];
}
