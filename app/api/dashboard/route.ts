import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { getDashboardStats } from "@/lib/services/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardStats());
  } catch (error) {
    console.error(error);

    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Could not load dashboard stats." },
      { status: 500 },
    );
  }
}
