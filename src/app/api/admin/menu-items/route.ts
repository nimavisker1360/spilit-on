export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, requirePermission } from "@/features/auth/auth-context";
import { createMenuItem, deleteMenuItem, updateMenuItem } from "@/features/menu/menu.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "menu.manage", { branchId: String(json.branchId ?? "") });
    const item = await createMenuItem(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.item.create",
      entityType: "menuItem",
      entityId: item.id,
      branchId: item.branchId,
      after: item
    });
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "menu.manage", "menuItem", String(json.id ?? ""));
    const item = await updateMenuItem(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.item.update",
      entityType: "menuItem",
      entityId: item.id,
      branchId: item.branchId,
      after: item
    });
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "menu.manage", "menuItem", String(json.id ?? ""));
    const item = await deleteMenuItem(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.item.delete",
      entityType: "menuItem",
      entityId: item.id,
      branchId: item.branchId,
      before: item
    });
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
