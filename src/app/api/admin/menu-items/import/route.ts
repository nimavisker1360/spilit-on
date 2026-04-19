export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requirePermission } from "@/features/auth/auth-context";
import { importMenuItems } from "@/features/menu/menu.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requirePermission(request, "menu.manage", { branchId: String(json.branchId ?? "") });
    const result = await importMenuItems(json);
    await recordAuditLog({
      context,
      request,
      action: "menu.item.import",
      entityType: "menuImport",
      branchId: String(json.branchId ?? ""),
      metadata: result
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
