import { KitchenItemStatus, OrderStatus } from "@prisma/client";
import { z } from "zod";

import { cloneValue, getOrderItems, readStore, sortByCreatedAtAsc, updateStore } from "@/lib/local-store";

export const updateKitchenStatusSchema = z.object({
  orderItemId: z.string().min(1),
  status: z.nativeEnum(KitchenItemStatus)
});

type KitchenWorkflowStatus = Exclude<KitchenItemStatus, "VOID">;

const kitchenWorkflowTransitions: Record<KitchenWorkflowStatus, KitchenWorkflowStatus[]> = {
  PENDING: ["PENDING", "IN_PROGRESS"],
  IN_PROGRESS: ["IN_PROGRESS", "PENDING", "READY"],
  READY: ["READY", "IN_PROGRESS", "SERVED"],
  SERVED: ["SERVED"]
};

function isKitchenWorkflowStatus(status: KitchenItemStatus): status is KitchenWorkflowStatus {
  return status !== "VOID";
}

function assertKitchenTransition(current: KitchenItemStatus, next: KitchenItemStatus) {
  if (!isKitchenWorkflowStatus(current) || !isKitchenWorkflowStatus(next)) {
    throw new Error("Kitchen workflow only supports PENDING, IN_PROGRESS, READY, and SERVED.");
  }

  const allowed = kitchenWorkflowTransitions[current];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid kitchen transition: ${current} -> ${next}`);
  }
}

function deriveOrderStatus(itemStatuses: KitchenItemStatus[]): OrderStatus {
  const nonVoided = itemStatuses.filter((status) => status !== "VOID");

  if (nonVoided.length === 0) {
    return "CANCELLED";
  }

  if (nonVoided.every((status) => status === "SERVED")) {
    return "COMPLETED";
  }

  if (nonVoided.every((status) => status === "READY" || status === "SERVED")) {
    return "READY";
  }

  if (nonVoided.some((status) => status === "IN_PROGRESS")) {
    return "IN_PROGRESS";
  }

  if (nonVoided.some((status) => status !== "PENDING")) {
    return "IN_PROGRESS";
  }

  return "PENDING";
}

export async function listKitchenBoard(branchId?: string, branchIds?: string[] | null) {
  const store = readStore();
  const allowedBranchIds = branchIds ? new Set(branchIds) : null;

  return cloneValue(
    sortByCreatedAtAsc(
      store.orderItems.filter((item) => {
        if (!["PENDING", "IN_PROGRESS", "READY"].includes(item.status)) {
          return false;
        }

        const order = store.orders.find((entry) => entry.id === item.orderId);
        const session = order ? store.sessions.find((entry) => entry.id === order.sessionId) : null;

        if (!order || !session || session.status !== "OPEN") {
          return false;
        }

        return (!branchId || order.branchId === branchId) && (!allowedBranchIds || allowedBranchIds.has(order.branchId));
      })
    ).map((item) => {
      const order = store.orders.find((entry) => entry.id === item.orderId);
      const session = order ? store.sessions.find((entry) => entry.id === order.sessionId) : null;
      const table = session ? store.tables.find((entry) => entry.id === session.tableId) : null;
      const branch = session ? store.branches.find((entry) => entry.id === session.branchId) : null;
      const guest = store.guests.find((entry) => entry.id === item.guestId);

      if (!order || !session || !table || !branch || !guest) {
        throw new Error("Kitchen item relation mismatch");
      }

      return {
        ...item,
        guest: cloneValue(guest),
        order: {
          ...order,
          session: {
            ...session,
            table: cloneValue(table),
            branch: cloneValue(branch)
          }
        }
      };
    })
  );
}

export async function updateKitchenItemStatus(orderItemId: string, status: KitchenItemStatus) {
  updateKitchenStatusSchema.parse({ orderItemId, status });

  return updateStore((store) => {
    const existing = store.orderItems.find((item) => item.id === orderItemId);

    if (!existing) {
      throw new Error("Kitchen item not found");
    }

    const order = store.orders.find((entry) => entry.id === existing.orderId);
    const session = order ? store.sessions.find((entry) => entry.id === order.sessionId) : null;

    if (!order || !session) {
      throw new Error("Kitchen item relation mismatch");
    }

    if (session.status !== "OPEN") {
      throw new Error("Cannot update kitchen status for a closed session");
    }

    assertKitchenTransition(existing.status, status);
    existing.status = status;

    const allStatuses = getOrderItems(store, existing.orderId).map((item) => item.status);
    order.status = deriveOrderStatus(allStatuses);

    return cloneValue(existing);
  });
}
