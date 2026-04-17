export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listSessionsForCashier } from "@/features/cashier/cashier.service";
import { routeErrorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const sessions = await listSessionsForCashier(branchId);
    return NextResponse.json({ data: sessions });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
