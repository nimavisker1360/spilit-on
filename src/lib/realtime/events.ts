import type { KitchenItemStatus, OrderSource } from "@prisma/client";

export type RealtimeRole = "kitchen" | "waiter" | "cashier";

export const REALTIME_SOCKET_PATH = "/api/socket/io";
export const REALTIME_EVENT_NAME = "restaurant:sync";

export type RealtimeEvent =
  | {
      type: "order.created";
      orderId: string;
      sessionId: string;
      branchId: string;
      source: OrderSource;
    }
  | {
      type: "kitchen.item-status.updated";
      orderItemId: string;
      status: KitchenItemStatus;
    };

const validRoles = new Set<RealtimeRole>(["kitchen", "waiter", "cashier"]);

export function parseRealtimeRole(value: unknown): RealtimeRole | null {
  if (typeof value !== "string") {
    return null;
  }

  return validRoles.has(value as RealtimeRole) ? (value as RealtimeRole) : null;
}

export function roomForRole(role: RealtimeRole): string {
  return `role:${role}`;
}

export function getRealtimeTargets(_event: RealtimeEvent): RealtimeRole[] {
  return ["kitchen", "waiter", "cashier"];
}
