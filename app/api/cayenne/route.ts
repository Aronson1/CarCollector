import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { getCayenneOffers } from "@/lib/services/cayenne";
import type { CayenneGenerationFilter, CayenneSort } from "@/lib/cayenne";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await getCayenneOffers({
      generation: parseGeneration(searchParams.get("generation")),
      maxPrice: parseMaxPrice(searchParams.get("maxPrice")),
      sort: parseSort(searchParams.get("sort")),
      changedOnly: searchParams.get("changedOnly") === "true",
      watchlistedOnly: searchParams.get("watchlistedOnly") === "true",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Could not load Cayenne offers." },
      { status: 500 },
    );
  }
}

function parseGeneration(value: string | null): CayenneGenerationFilter {
  if (value === "current" || value === "previous") {
    return value;
  }

  return "currentAndPrevious";
}

function parseMaxPrice(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseSort(value: string | null): CayenneSort {
  if (
    value === "recentlyAdded" ||
    value === "newest" ||
    value === "priceAsc" ||
    value === "priceDesc" ||
    value === "deltaAsc" ||
    value === "deltaDesc" ||
    value === "yearDesc" ||
    value === "dealScoreDesc"
  ) {
    return value;
  }

  return "newest";
}
