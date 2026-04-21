export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { deleteOrderItem } from "@/features/order/order.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function DELETE(
  request: Request,
  context: {
    params: {
      orderItemId: string;
    };
  }
) {
  try {
    const accessContext = await requireEntityPermission(
      request,
      "order.delete",
      "orderItem",
      context.params.orderItemId
    );
    const result = await deleteOrderItem(context.params.orderItemId);
    emitRealtimeEvent({
      type: "order.item.deleted",
      orderItemId: result.item.id,
      orderId: result.orderId,
      sessionId: result.sessionId,
      branchId: result.branchId,
    });
    await recordAuditLog({
      context: accessContext,
      request,
      action: "order.item.delete",
      entityType: "orderItem",
      entityId: result.item.id,
      branchId: result.branchId,
      before: result.item,
      metadata: {
        orderId: result.orderId,
        sessionId: result.sessionId,
        deletedOrder: result.deletedOrder,
        orderStatus: result.orderStatus,
      },
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
