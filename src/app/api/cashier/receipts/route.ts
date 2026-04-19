export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getReadableBranchIds, requirePermission } from "@/features/auth/auth-context";
import { listReceiptsForCashier } from "@/features/cashier/cashier.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const context = await requirePermission(request, "cashier.read", { branchId });
    const receipts = await listReceiptsForCashier(branchId, getReadableBranchIds(context));

    return NextResponse.json({ data: receipts });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
