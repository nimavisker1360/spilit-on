export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getAdminSnapshot } from "@/features/restaurant/restaurant.service";
import { routeErrorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const snapshot = await getAdminSnapshot();
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
