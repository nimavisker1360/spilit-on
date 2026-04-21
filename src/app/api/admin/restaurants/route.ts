export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requirePermission } from "@/features/auth/auth-context";
import { updateRestaurant } from "@/features/restaurant/restaurant.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "tenant.update");
    const restaurant = await updateRestaurant(json);
    await recordAuditLog({
      context,
      request,
      action: "restaurant.update",
      entityType: "restaurant",
      entityId: restaurant.id,
      after: restaurant
    });
    return NextResponse.json({ data: restaurant });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
