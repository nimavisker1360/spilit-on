export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { placeWaiterOrder } from "@/features/order/order.service";
import { routeErrorMessage } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const order = await placeWaiterOrder(json);
    emitRealtimeEvent({
      type: "order.created",
      orderId: order.id,
      sessionId: order.sessionId,
      branchId: order.branchId,
      source: order.source
    });
    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
