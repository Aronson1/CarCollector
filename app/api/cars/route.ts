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
