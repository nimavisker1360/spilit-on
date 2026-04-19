export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getReadableBranchIds, requirePermission } from "@/features/auth/auth-context";
import { listSessionsForCashier } from "@/features/cashier/cashier.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const context = await requirePermission(request, "cashier.read", { branchId });
    const sessions = await listSessionsForCashier(branchId, getReadableBranchIds(context));
    return NextResponse.json({ data: sessions });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
