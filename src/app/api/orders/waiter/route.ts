export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { placeWaiterOrder } from "@/features/order/order.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "order.create.manual", "session", String(json.sessionId ?? ""));
    const order = await placeWaiterOrder(json);
    emitRealtimeEvent({
      type: "order.created",
      orderId: order.id,
      sessionId: order.sessionId,
      branchId: order.branchId,
      source: order.source
    });
    await recordAuditLog({
      context,
      request,
      action: "order.create.manual",
      entityType: "order",
      entityId: order.id,
      branchId: order.branchId,
      after: order
    });
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
