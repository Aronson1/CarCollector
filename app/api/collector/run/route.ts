import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import {
  backfillOfferImages,
  backfillOfferPower,
  runCollector,
} from "@/lib/services/collector";
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
  const body = await readBody(request);
  const purchaseOption = parsePurchaseOption(body);

  if (body?.mode === "images") {
    return runImageBackfillRequest(
      purchaseOption,
      parsePositiveInteger(body.pageNumber, 1),
      parsePageSize(body.pageSize, 30),
    );
  }

  if (body?.mode === "power") {
    return runPowerBackfillRequest(
      purchaseOption,
      parsePositiveInteger(body.pageNumber, 1),
      parsePageSize(body.pageSize, 30),
    );
  }

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

async function runImageBackfillRequest(
  purchaseOption: PurchaseOption,
  pageNumber: number,
  pageSize: number,
) {
  if (purchaseOption === "newRelease") {
    return NextResponse.json(
      { message: "Image backfill is only available for used offers." },
      { status: 400 },
    );
  }

  try {
    const result = await backfillOfferImages(
      purchaseOption,
      pageNumber,
      pageSize,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Image backfill failed." },
      { status: 500 },
    );
  }
}

async function runPowerBackfillRequest(
  purchaseOption: PurchaseOption,
  pageNumber: number,
  pageSize: number,
) {
  if (purchaseOption === "newRelease") {
    return NextResponse.json(
      { message: "Power backfill is only available for used offers." },
      { status: 400 },
    );
  }

  try {
    const result = await backfillOfferPower(
      purchaseOption,
      pageNumber,
      pageSize,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Power backfill failed." },
      { status: 500 },
    );
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parsePurchaseOption(body: Record<string, unknown> | null): PurchaseOption {
  if (body?.purchaseOption === "sale") {
    return "sale";
  }

  if (body?.purchaseOption === "newRelease") {
    return "newRelease";
  }

  return "release";
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: unknown, fallback: number) {
  const parsed = parsePositiveInteger(value, fallback);
  return Math.min(parsed, 50);
}
