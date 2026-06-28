import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { setCayenneWatchlistStatus } from "@/lib/services/cayenne";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await request.json();
    const watchlist = await setCayenneWatchlistStatus(
      id,
      Boolean(body?.isWatchlisted),
    );

    if (!watchlist) {
      return NextResponse.json(
        { message: "Cayenne offer not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(watchlist);
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Could not update Cayenne watchlist." },
      { status: 500 },
    );
  }
}
