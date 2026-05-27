import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { getCarFilterOptions } from "@/lib/services/cars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const filters = await getCarFilterOptions(
      parsePurchaseOption(searchParams.get("purchaseOption")),
      searchParams.get("brand") || undefined,
    );

    return NextResponse.json(filters);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Could not load filter options." },
      { status: 500 },
    );
  }
}

function parsePurchaseOption(value: string | null) {
  if (value === "newRelease") return "newRelease";
  return value === "sale" ? "sale" : "release";
}
