export const dynamic = "force-dynamic";

import { KitchenItemStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { updateKitchenItemStatus } from "@/features/kitchen/kitchen.service";
import { routeErrorMessage } from "@/lib/errors";
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
    const item = await updateKitchenItemStatus(context.params.orderItemId, parsed.status);
    emitRealtimeEvent({
      type: "kitchen.item-status.updated",
      orderItemId: item.id,
      status: item.status
    });
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
