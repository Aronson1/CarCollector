import { NextResponse } from "next/server";
import {
  getSettingsStatus,
  updateAppSettings,
} from "@/lib/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getSettingsStatus());
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Could not load settings." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await updateAppSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Could not update settings." },
      { status: 500 },
    );
  }
}
