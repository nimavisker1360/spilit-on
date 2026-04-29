import type { KitchenItemStatus, OrderSource } from "@prisma/client";

export type RealtimeRole = "admin" | "kitchen" | "waiter" | "cashier" | "guest" | "super-admin";

export const REALTIME_SOCKET_PATH = "/api/socket/io";
export const REALTIME_EVENT_NAME = "restaurant:sync";

export type RealtimeEvent =
  | {
      type: "guest.qr-opened";
      tableCode: string;
      branchId: string;
      sessionId: string | null;
    }
  | {
      type: "session.opened";
      sessionId: string;
      branchId: string;
      tableCode: string;
    }
  | {
      type: "session.closed";
      sessionId: string;
      branchId: string;
      tableCode: string;
    }
  | {
      type: "session.guest-joined";
      sessionId: string;
      branchId: string;
      tableCode: string;
      guestId: string;
    }
  | {
      type: "order.created";
      orderId: string;
      sessionId: string;
      branchId: string;
      source: OrderSource;
    }
  | {
      type: "order.item.deleted";
      orderItemId: string;
      orderId: string;
      sessionId: string;
      branchId: string;
    }
  | {
      type: "kitchen.item-status.updated";
      orderItemId: string;
      status: KitchenItemStatus;
    }
  | {
      type: "platform.payment.updated";
      paymentId: string;
      restaurantId: string;
      status: string;
    };

const validRoles = new Set<RealtimeRole>(["admin", "kitchen", "waiter", "cashier", "guest", "super-admin"]);

export function parseRealtimeRole(value: unknown): RealtimeRole | null {
  if (typeof value !== "string") {
    return null;
  }

  return validRoles.has(value as RealtimeRole) ? (value as RealtimeRole) : null;
}

export function roomForRole(role: RealtimeRole): string {
  return `role:${role}`;
}

export function getRealtimeTargets(event: RealtimeEvent): RealtimeRole[] {
  if (event.type === "platform.payment.updated") {
    return ["super-admin"];
  }

  return ["admin", "kitchen", "waiter", "cashier", "guest"];
}
