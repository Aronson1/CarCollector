import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";
import { savePushSubscription } from "@/lib/services/push-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    const saved = await savePushSubscription(
      subscription,
      request.headers.get("user-agent"),
    );

    if (!saved) {
      return NextResponse.json(
        { message: "Invalid push subscription." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { message: "Push subscription failed." },
      { status: 500 },
    );
  }
}
