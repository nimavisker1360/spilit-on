export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, requirePermission } from "@/features/auth/auth-context";
import { createTable, deleteTable, updateTable } from "@/features/table/table.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "table.manage", { branchId: String(json.branchId ?? "") });
    const table = await createTable(json);
    await recordAuditLog({
      context,
      request,
      action: "table.create",
      entityType: "table",
      entityId: table.id,
      branchId: table.branchId,
      after: table
    });
    return NextResponse.json({ data: table }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "table.manage", "table", String(json.id ?? ""));
    const table = await updateTable(json);
    await recordAuditLog({
      context,
      request,
      action: "table.update",
      entityType: "table",
      entityId: table.id,
      branchId: table.branchId,
      after: table
    });
    return NextResponse.json({ data: table });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "table.manage", "table", String(json.id ?? ""));
    const table = await deleteTable(json);
    await recordAuditLog({
      context,
      request,
      action: "table.delete",
      entityType: "table",
      entityId: table.id,
      branchId: table.branchId,
      before: table
    });
    return NextResponse.json({ data: table });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
