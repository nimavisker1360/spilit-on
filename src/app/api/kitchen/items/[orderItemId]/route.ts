export const dynamic = "force-dynamic";

import { KitchenItemStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { updateKitchenItemStatus } from "@/features/kitchen/kitchen.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

const bodySchema = z.object({
  status: z.nativeEnum(KitchenItemStatus)
});

export async function PATCH(
  request: Request,
  context: {
    params: {
      orderItemId: string;
    };
  }
) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const accessContext = await requireEntityPermission(
      request,
      "kitchen.update",
      "orderItem",
      context.params.orderItemId
    );
    const item = await updateKitchenItemStatus(context.params.orderItemId, parsed.status);
    emitRealtimeEvent({
      type: "kitchen.item-status.updated",
      orderItemId: item.id,
      status: item.status
    });
    await recordAuditLog({
      context: accessContext,
      request,
      action: "kitchen.item.status.update",
      entityType: "orderItem",
      entityId: item.id,
      after: item
    });
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
