export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, requirePermission } from "@/features/auth/auth-context";
import { createBranch, deleteBranch, updateBranch } from "@/features/restaurant/restaurant.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "branch.create");
    const branch = await createBranch(json);
    await recordAuditLog({
      context,
      request,
      action: "branch.create",
      entityType: "branch",
      entityId: branch.id,
      branchId: branch.id,
      after: branch
    });
    return NextResponse.json({ data: branch }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "branch.update", "branch", String(json.id ?? ""));
    const branch = await updateBranch(json);
    await recordAuditLog({
      context,
      request,
      action: "branch.update",
      entityType: "branch",
      entityId: branch.id,
      branchId: branch.id,
      after: branch
    });
    return NextResponse.json({ data: branch });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "branch.delete", "branch", String(json.id ?? ""));
    const branch = await deleteBranch(json);
    await recordAuditLog({
      context,
      request,
      action: "branch.delete",
      entityType: "branch",
      entityId: branch.id,
      branchId: branch.id,
      before: branch
    });
    return NextResponse.json({ data: branch });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
