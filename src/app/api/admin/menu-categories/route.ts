export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, requirePermission } from "@/features/auth/auth-context";
import { createMenuCategory, deleteMenuCategory, updateMenuCategory } from "@/features/menu/menu.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "menu.manage", { branchId: String(json.branchId ?? "") });
    const category = await createMenuCategory(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.category.create",
      entityType: "menuCategory",
      entityId: category.id,
      branchId: category.branchId,
      after: category
    });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "menu.manage", "menuCategory", String(json.id ?? ""));
    const category = await updateMenuCategory(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.category.update",
      entityType: "menuCategory",
      entityId: category.id,
      branchId: category.branchId,
      after: category
    });
    return NextResponse.json({ data: category });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "menu.manage", "menuCategory", String(json.id ?? ""));
    const category = await deleteMenuCategory(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.category.delete",
      entityType: "menuCategory",
      entityId: category.id,
      branchId: category.branchId,
      before: category
    });
    return NextResponse.json({ data: category });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
