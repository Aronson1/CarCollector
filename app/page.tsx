import HomeClient from "./home-client";
import { getCarFilterOptions, getCars } from "@/lib/services/cars";
import type { CarFilterOptions, CarSearchResult } from "@/lib/services/cars";
import type { PurchaseOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const initialPurchaseOption: PurchaseOption = "release";

export default async function HomePage() {
  let initialMessage: string | undefined;
  let initialCars: CarSearchResult = {
    cars: [],
    page: 1,
    pageSize: 30,
    total: 0,
    totalPages: 1,
  };
  let initialFilterOptions: CarFilterOptions = {
    brands: [],
    models: [],
    fuelTypes: [],
    gearboxes: [],
  };

  try {
    [initialCars, initialFilterOptions] = await Promise.all([
      getCars({
        purchaseOption: initialPurchaseOption,
        sort: "newest",
        page: 1,
        pageSize: 30,
      }),
      getCarFilterOptions(initialPurchaseOption),
    ]);
  } catch (error) {
    console.error(error);
    initialMessage = "Nie udało się pobrać ofert przy starcie aplikacji.";
  }

  return (
    <HomeClient
      initialCars={initialCars}
      initialFilterOptions={initialFilterOptions}
      initialMessage={initialMessage}
      initialPurchaseOption={initialPurchaseOption}
    />
  );
}
