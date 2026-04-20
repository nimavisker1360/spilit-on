import { KitchenItemStatus, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const updateKitchenStatusSchema = z.object({
  orderItemId: z.string().min(1),
  status: z.nativeEnum(KitchenItemStatus),
});

type KitchenWorkflowStatus = Exclude<KitchenItemStatus, "VOID">;

const kitchenWorkflowTransitions: Record<KitchenWorkflowStatus, KitchenWorkflowStatus[]> = {
  PENDING: ["PENDING", "IN_PROGRESS"],
  IN_PROGRESS: ["IN_PROGRESS", "PENDING", "READY"],
  READY: ["READY", "IN_PROGRESS", "SERVED"],
  SERVED: ["SERVED"],
};

function assertKitchenTransition(current: KitchenItemStatus, next: KitchenItemStatus) {
  if (current === "VOID" || next === "VOID") {
    throw new Error("Kitchen workflow only supports PENDING, IN_PROGRESS, READY, and SERVED.");
  }
  const allowed = kitchenWorkflowTransitions[current as KitchenWorkflowStatus];
  if (!allowed.includes(next as KitchenWorkflowStatus)) {
    throw new Error(`Invalid kitchen transition: ${current} -> ${next}`);
  }
}

function deriveOrderStatus(itemStatuses: KitchenItemStatus[]): OrderStatus {
  const nonVoided = itemStatuses.filter((s) => s !== "VOID");
  if (nonVoided.length === 0) return "CANCELLED";
  if (nonVoided.every((s) => s === "SERVED")) return "COMPLETED";
  if (nonVoided.every((s) => s === "READY" || s === "SERVED")) return "READY";
  if (nonVoided.some((s) => s === "IN_PROGRESS")) return "IN_PROGRESS";
  if (nonVoided.some((s) => s !== "PENDING")) return "IN_PROGRESS";
  return "PENDING";
}

export async function listKitchenBoard(branchId?: string, branchIds?: string[] | null) {
  return prisma.orderItem.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS", "READY"] },
      order: {
        ...(branchId ? { branchId } : {}),
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
        session: { status: "OPEN" },
      },
    },
    include: {
      guest: true,
      order: {
        include: {
          session: {
            include: {
              table: true,
              branch: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateKitchenItemStatus(orderItemId: string, status: KitchenItemStatus) {
  updateKitchenStatusSchema.parse({ orderItemId, status });

  const existing = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: { include: { session: true } } },
  });

  if (!existing) throw new Error("Kitchen item not found");
  if (!existing.order?.session) throw new Error("Kitchen item relation mismatch");
  if (existing.order.session.status !== "OPEN") {
    throw new Error("Cannot update kitchen status for a closed session");
  }

  assertKitchenTransition(existing.status, status);

  const updated = await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { status },
  });

  const allItems = await prisma.orderItem.findMany({
    where: { orderId: existing.orderId },
    select: { status: true },
  });

  const newOrderStatus = deriveOrderStatus(allItems.map((i) => i.status));
  await prisma.order.update({
    where: { id: existing.orderId },
    data: { status: newOrderStatus },
  });

  return updated;
}
