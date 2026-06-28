import CayenneClient from "./cayenne-client";
import { getCayenneOffers } from "@/lib/services/cayenne";
import type { CayenneSearchResult } from "@/lib/cayenne";

export const dynamic = "force-dynamic";

export default async function CayennePage() {
  let initialMessage: string | undefined;
  let initialData: CayenneSearchResult = {
    offers: [],
    total: 0,
  };

  try {
    initialData = await getCayenneOffers({
      generation: "currentAndPrevious",
      maxPrice: 250000,
      sort: "recentlyAdded",
    });
  } catch (error) {
    console.error(error);
    initialMessage = "Nie udało się pobrać ofert Porsche Cayenne.";
  }

  return (
    <CayenneClient initialData={initialData} initialMessage={initialMessage} />
  );
}
