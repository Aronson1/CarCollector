import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { getCars } from "@/lib/services/cars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await getCars({
      purchaseOption: parsePurchaseOption(searchParams.get("purchaseOption")),
      id: searchParams.get("id") || undefined,
      brand: searchParams.get("brand") || undefined,
      model: searchParams.get("model") || undefined,
      changedOnly: searchParams.get("changedOnly") === "true",
      availableOnly: searchParams.get("availableOnly") === "true",
      watchlistedOnly: searchParams.get("watchlistedOnly") === "true",
      yearFrom: parseNumber(searchParams.get("yearFrom")),
      yearTo: parseNumber(searchParams.get("yearTo")),
      mileageFrom: parseNumber(searchParams.get("mileageFrom")),
      mileageTo: parseNumber(searchParams.get("mileageTo")),
      fuelType: searchParams.get("fuelType") || undefined,
      gearbox: searchParams.get("gearbox") || undefined,
      contractMonthsFrom: parseNumber(searchParams.get("contractMonthsFrom")),
      contractMonthsTo: parseNumber(searchParams.get("contractMonthsTo")),
      annualMileageFrom: parseNumber(searchParams.get("annualMileageFrom")),
      annualMileageTo: parseNumber(searchParams.get("annualMileageTo")),
      downPaymentFrom: parseNumber(searchParams.get("downPaymentFrom")),
      downPaymentTo: parseNumber(searchParams.get("downPaymentTo")),
      sort: parseSort(searchParams.get("sort")),
      page: parsePage(searchParams.get("page")),
      pageSize: parsePageSize(searchParams.get("pageSize")),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Could not load cars." },
      { status: 500 },
    );
  }
}

function parsePurchaseOption(value: string | null) {
  if (value === "newRelease") return "newRelease";
  return value === "sale" ? "sale" : "release";
}

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseNumber(value: string | null) {
  if (!value) return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parsePageSize(value: string | null) {
  if (value === "all") return "all";

  const pageSize = Number(value);
  return [10, 30, 60, 100].includes(pageSize) ? pageSize : 30;
}

function parseSort(value: string | null) {
  if (
    value === "newest" ||
    value === "oldest" ||
    value === "priceAsc" ||
    value === "priceDesc" ||
    value === "deltaAsc" ||
    value === "deltaDesc" ||
    value === "dealScoreDesc"
  ) {
    return value;
  }

  return undefined;
}
