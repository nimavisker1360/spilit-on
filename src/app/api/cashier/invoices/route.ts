export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { createInvoice } from "@/features/cashier/cashier.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(
      request,
      "cashier.invoice.create",
      "session",
      String(json.sessionId ?? "")
    );
    const invoice = await createInvoice(json);
    await recordAuditLog({
      context,
      request,
      action: "cashier.invoice.create",
      entityType: "invoice",
      entityId: invoice.id,
      branchId: invoice.session.branchId,
      after: invoice
    });
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
