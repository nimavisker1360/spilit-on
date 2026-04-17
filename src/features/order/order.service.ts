import { OrderSource } from "@prisma/client";

import {
  cloneValue,
  currentTimestamp,
  getOrderItems,
  getSessionGuests,
  makeId,
  readStore,
  sortByCreatedAtAsc,
  updateStore
} from "@/lib/local-store";
import {
  createCustomerOrderSchema,
  createWaiterOrderSchema,
  type CreateCustomerOrderInput,
  type CreateWaiterOrderInput
} from "@/features/order/order.schemas";

type CreateOrderInternalInput = {
  sessionId: string;
  source: OrderSource;
  placedByGuestId?: string;
  note?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    guestId?: string;
    note?: string;
  }>;
};

async function createOrderInternal(input: CreateOrderInternalInput) {
  return updateStore((store) => {
    const session = store.sessions.find((entry) => entry.id === input.sessionId);

    if (!session || session.status !== "OPEN") {
      throw new Error("Session is not open");
    }

    const guests = getSessionGuests(store, session.id);
    const guestIdSet = new Set(guests.map((guest) => guest.id));

    if (input.placedByGuestId && !guestIdSet.has(input.placedByGuestId)) {
      throw new Error("Placed-by guest is not part of this session");
    }

    const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
    const menuItems = store.menuItems.filter(
      (item) =>
        menuItemIds.includes(item.id) && item.branchId === session.branchId && item.isAvailable
    );

    if (menuItems.length !== menuItemIds.length) {
      throw new Error("One or more menu items are unavailable");
    }

    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const now = currentTimestamp();
    const order = {
      id: makeId("order"),
      branchId: session.branchId,
      sessionId: session.id,
      source: input.source,
      status: "PENDING" as const,
      placedByGuestId: input.placedByGuestId ?? null,
      note: input.note ?? null,
      createdAt: now
    };

    const normalizedItems = input.items.map((item) => {
      const assignedGuestId = item.guestId ?? input.placedByGuestId;

      if (!assignedGuestId) {
        throw new Error("Each order item must be assigned to a guest");
      }

      if (!guestIdSet.has(assignedGuestId)) {
        throw new Error("One or more guest assignments are invalid");
      }

      const menuItem = menuItemMap.get(item.menuItemId);

      if (!menuItem) {
        throw new Error("Menu item mismatch");
      }

      return {
        id: makeId("order_item"),
        orderId: order.id,
        menuItemId: menuItem.id,
        itemName: menuItem.name,
        quantity: item.quantity,
        guestId: assignedGuestId,
        note: item.note ?? null,
        unitPrice: menuItem.price,
        status: "PENDING" as const,
        createdAt: now
      };
    });

    store.orders.push(order);
    store.orderItems.push(...normalizedItems);

    const table = store.tables.find((entry) => entry.id === session.tableId);

    return cloneValue({
      ...order,
      items: normalizedItems.map((item) => ({
        ...item,
        guest: cloneValue(guests.find((guest) => guest.id === item.guestId))
      })),
      session: {
        ...session,
        table: cloneValue(table)
      }
    });
  });
}

export async function placeCustomerOrder(input: CreateCustomerOrderInput) {
  const parsed = createCustomerOrderSchema.parse(input);

  return createOrderInternal({
    sessionId: parsed.sessionId,
    source: "CUSTOMER",
    placedByGuestId: parsed.guestId,
    note: parsed.note,
    items: parsed.items
  });
}

export async function placeWaiterOrder(input: CreateWaiterOrderInput) {
  const parsed = createWaiterOrderSchema.parse(input);

  return createOrderInternal({
    sessionId: parsed.sessionId,
    source: "WAITER",
    note: parsed.note,
    items: parsed.items
  });
}

export async function getSessionOrderFeed(sessionId: string) {
  const store = readStore();
  const guests = getSessionGuests(store, sessionId);
  const guestMap = new Map(guests.map((guest) => [guest.id, guest]));

  return cloneValue(
    sortByCreatedAtAsc(store.orders.filter((order) => order.sessionId === sessionId))
      .reverse()
      .map((order) => ({
        ...order,
        items: getOrderItems(store, order.id).map((item) => ({
          ...item,
          guest: cloneValue(guestMap.get(item.guestId))
        }))
      }))
  );
}
