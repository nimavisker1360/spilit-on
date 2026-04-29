export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requirePermission } from "@/features/auth/auth-context";
import { initializeProPlanActivation } from "@/features/billing/billing-payment.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function buyerIpFromRequest(request: Request): string | null {
  return (
    firstForwardedValue(request.headers.get("x-forwarded-for")) ??
    request.headers.get("x-real-ip")?.trim() ??
    null
  );
}

export async function POST(request: Request) {
  try {
    const context = await requirePermission(request, "tenant.update");
    const result = await initializeProPlanActivation({
      restaurantId: context.restaurantId,
      buyerIp: buyerIpFromRequest(request)
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: routeErrorMessage(error) },
      { status: routeErrorStatus(error) }
    );
  }
}
