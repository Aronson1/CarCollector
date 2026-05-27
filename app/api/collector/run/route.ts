import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { runCollector } from "@/lib/services/collector";
import type { PurchaseOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { message: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  return runCollectorRequest("all");
}

export async function POST(request: Request) {
  const purchaseOption = await parsePurchaseOption(request);
  return runCollectorRequest(purchaseOption);
}

function isAuthorized(request: Request, cronSecret: string): boolean {
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;

  return headerSecret === cronSecret || bearerSecret === cronSecret;
}

async function runCollectorRequest(purchaseOption: PurchaseOption | "all") {
  try {
    const result = await runCollector(purchaseOption);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Collector run failed." },
      { status: 500 },
    );
  }
}

async function parsePurchaseOption(request: Request): Promise<PurchaseOption> {
  try {
    const body = await request.json();

    if (body?.purchaseOption === "sale") {
      return "sale";
    }
  } catch {
    return "release";
  }

  return "release";
}
