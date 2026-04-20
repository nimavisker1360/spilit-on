export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requirePermission } from "@/features/auth/auth-context";
import { createMenuCategory, createMenuItem } from "@/features/menu/menu.service";
import { createBranch, getAdminSnapshot } from "@/features/restaurant/restaurant.service";
import { createTable } from "@/features/table/table.service";
import { RouteAccessError, routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new RouteAccessError("Seed endpoint is disabled in production.", 403);
    }

    const context = await requirePermission(request, "tenant.update");
    const snapshot = await getAdminSnapshot({ restaurantId: context.restaurantId });

    if (snapshot[0]?.branches.length === 0) {
      await createBranch({
        restaurantId: context.restaurantId,
        name: "Main Branch",
        slug: "main-branch",
        location: "Center"
      });
    }

    const freshSnapshot = await getAdminSnapshot({ restaurantId: context.restaurantId });
    const branch = freshSnapshot[0]?.branches[0];

    if (!branch) {
      throw new Error("Failed to load branch for seeding");
    }

    if (branch.tables.length === 0) {
      await createTable({ branchId: branch.id, name: "T1", capacity: 4 });
      await createTable({ branchId: branch.id, name: "T2", capacity: 4 });
      await createTable({ branchId: branch.id, name: "T3", capacity: 6 });
    }

    if (branch.menuCategories.length === 0) {
      const cat = await createMenuCategory({
        branchId: branch.id,
        name: "Main",
        sortOrder: 1
      });

      await createMenuItem({
        branchId: branch.id,
        categoryId: cat.id,
        name: "Cheese Burger",
        description: "Classic burger",
        price: 11.5,
        sortOrder: 1,
        isAvailable: true
      });

      await createMenuItem({
        branchId: branch.id,
        categoryId: cat.id,
        name: "Cola",
        description: "Cold drink",
        price: 2.8,
        sortOrder: 2,
        isAvailable: true
      });
    }

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
