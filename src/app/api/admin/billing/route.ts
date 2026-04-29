export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/features/auth/auth-context";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { getRestaurantFeatures } from "@/features/billing/feature-gate.service";
import { getEffectiveTrialEndsAt } from "@/features/billing/plan-config";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const context = await requirePermission(request, "tenant.read");

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: context.restaurantId },
      select: { name: true, trialStartedAt: true, trialEndsAt: true }
    });

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const featureAccess = await getRestaurantFeatures(context.restaurantId);
    const effectiveTrialEndsAt = getEffectiveTrialEndsAt(
      restaurant.trialStartedAt,
      restaurant.trialEndsAt
    );

    return NextResponse.json({
      data: {
        featureAccess,
        restaurant: {
          ...restaurant,
          trialEndsAt: effectiveTrialEndsAt
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: routeErrorMessage(error) },
      { status: routeErrorStatus(error) }
    );
  }
}
