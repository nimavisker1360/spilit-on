export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission, resolveEntityBranchId } from "@/features/auth/auth-context";
import { createPaymentSessionFromInvoice } from "@/features/payment/payment.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";

type RouteContext = {
  params: {
    invoiceId: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const branchId = resolveEntityBranchId("invoice", context.params.invoiceId);
    const accessContext = await requireEntityPermission(
      request,
      "cashier.payment.manage",
      "invoice",
      context.params.invoiceId
    );
    const result = await createPaymentSessionFromInvoice(context.params.invoiceId);
    if (result.created) {
      await recordAuditLog({
        context: accessContext,
        request,
        action: "cashier.payment_session.create",
        entityType: "paymentSession",
        entityId: result.paymentSession.id,
        branchId,
        metadata: { invoiceId: context.params.invoiceId }
      });
    }
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
