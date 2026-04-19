export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getReadableBranchIds, requirePermission } from "@/features/auth/auth-context";
import { getAdminSnapshot } from "@/features/restaurant/restaurant.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const context = await requirePermission(request, "tenant.read");
    const snapshot = await getAdminSnapshot({
      restaurantId: context.restaurantId,
      branchIds: getReadableBranchIds(context)
    });
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
