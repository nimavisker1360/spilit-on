export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, resolveEntityBranchId } from "@/features/auth/auth-context";
import { applyCashierPaymentShareAction } from "@/features/payment/payment.service";
import { cashierPaymentShareActionSchema } from "@/features/payment/payment.schemas";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

const bodySchema = z
  .object({
    action: cashierPaymentShareActionSchema
  })
  .strict();

type RouteContext = {
  params: {
    paymentShareId: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const branchId = resolveEntityBranchId("paymentShare", context.params.paymentShareId);
    const accessContext = await requireEntityPermission(
      request,
      "cashier.payment.manage",
      "paymentShare",
      context.params.paymentShareId
    );
    const result = await applyCashierPaymentShareAction(context.params.paymentShareId, parsed.action);
    await recordAuditLog({
      context: accessContext,
      request,
      action: "cashier.payment_share.action",
      entityType: "paymentShare",
      entityId: result.paymentShare.id,
      branchId,
      metadata: { action: parsed.action, status: result.paymentShare.status }
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
