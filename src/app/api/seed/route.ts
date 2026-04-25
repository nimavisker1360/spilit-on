export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requirePermission } from "@/features/auth/auth-context";
import { ensureRestaurantStarterWorkspace } from "@/features/restaurant/restaurant.service";
import { RouteAccessError, routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new RouteAccessError("Seed endpoint is disabled in production.", 403);
    }

    const context = await requirePermission(request, "tenant.update");
    await ensureRestaurantStarterWorkspace(context.restaurantId);

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
