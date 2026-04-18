import { type KitchenItemStatus, OrderSource } from "@prisma/client";

import { centsToDecimalString, toCents } from "@/lib/currency";
import {
  cloneValue,
  currentTimestamp,
  getOrderItems,
  getSessionGuests,
  getSessionOrders,
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

type GuestOrderLookupInput = {
  guestId?: string;
  sessionId?: string;
};

type GuestStatusCounts = {
  PENDING: number;
  IN_PROGRESS: number;
  READY: number;
  SERVED: number;
  VOID: number;
};

export type GuestOrderFeedDetail = {
  table: {
    id: string;
    name: string;
    code: string;
  };
  session: {
    id: string;
    openedAt: string;
  } | null;
  identifiedGuest: {
    id: string;
    displayName: string;
  } | null;
  summary: {
    guestName: string | null;
    itemCount: number;
    subtotal: string;
    unpaidAmount: string | null;
    statusCounts: GuestStatusCounts;
  };
  orders: Array<{
    id: string;
    source: OrderSource;
    createdAt: string;
    subtotal: string;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      note: string | null;
      createdAt: string;
      status: KitchenItemStatus;
    }>;
  }>;
};

function createEmptyStatusCounts(): GuestStatusCounts {
  return {
    PENDING: 0,
    IN_PROGRESS: 0,
    READY: 0,
    SERVED: 0,
    VOID: 0
  };
}

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

export async function getGuestOrderFeed(tableCode: string, lookup: GuestOrderLookupInput): Promise<GuestOrderFeedDetail> {
  const normalizedTableCode = tableCode.trim();
  const normalizedGuestId = lookup.guestId?.trim() ?? "";
  const normalizedSessionId = lookup.sessionId?.trim() ?? "";
  const store = readStore();
  const table = store.tables.find((entry) => entry.code === normalizedTableCode);

  if (!table || table.status === "OUT_OF_SERVICE") {
    throw new Error("Table not found");
  }

  const activeSession = store.sessions.find((session) => session.tableId === table.id && session.status === "OPEN") ?? null;
  const guests = activeSession ? getSessionGuests(store, activeSession.id) : [];
  const baseDetail: GuestOrderFeedDetail = {
    table: {
      id: table.id,
      name: table.name,
      code: table.code
    },
    session: activeSession
      ? {
          id: activeSession.id,
          openedAt: activeSession.openedAt
        }
      : null,
    identifiedGuest: null,
    summary: {
      guestName: null,
      itemCount: 0,
      subtotal: "0.00",
      unpaidAmount: null,
      statusCounts: createEmptyStatusCounts()
    },
    orders: []
  };

  if (!activeSession) {
    return cloneValue(baseDetail);
  }

  if (!normalizedGuestId || (normalizedSessionId && normalizedSessionId !== activeSession.id)) {
    return cloneValue(baseDetail);
  }

  const guest = guests.find((entry) => entry.id === normalizedGuestId) ?? null;

  if (!guest) {
    return cloneValue(baseDetail);
  }

  const statusCounts = createEmptyStatusCounts();
  let itemCount = 0;
  let subtotalCents = 0;

  const orders = getSessionOrders(store, activeSession.id)
    .map((order) => {
      let orderSubtotalCents = 0;

      const items = getOrderItems(store, order.id)
        .filter((item) => item.guestId === guest.id)
        .map((item) => {
          statusCounts[item.status] += 1;
          itemCount += item.quantity;

          const lineTotalCents = toCents(item.unitPrice) * item.quantity;
          if (item.status !== "VOID") {
            subtotalCents += lineTotalCents;
            orderSubtotalCents += lineTotalCents;
          }

          return {
            id: item.id,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: centsToDecimalString(lineTotalCents),
            note: item.note,
            createdAt: item.createdAt,
            status: item.status
          };
        });

      if (items.length === 0) {
        return null;
      }

      return {
        id: order.id,
        source: order.source,
        createdAt: order.createdAt,
        subtotal: centsToDecimalString(orderSubtotalCents),
        items
      };
    })
    .filter((order): order is NonNullable<typeof order> => Boolean(order))
    .reverse();

  const paymentSession =
    sortByCreatedAtAsc(store.paymentSessions.filter((entry) => entry.sessionId === activeSession.id)).at(-1) ?? null;
  const paymentShare =
    paymentSession
      ? store.paymentShares.find((entry) => entry.paymentSessionId === paymentSession.id && entry.guestId === guest.id) ?? null
      : null;

  return cloneValue({
    ...baseDetail,
    identifiedGuest: {
      id: guest.id,
      displayName: guest.displayName
    },
    summary: {
      guestName: guest.displayName,
      itemCount,
      subtotal: centsToDecimalString(subtotalCents),
      unpaidAmount: paymentShare
        ? paymentShare.status === "PAID"
          ? "0.00"
          : paymentShare.status === "CANCELLED"
            ? null
            : paymentShare.amount
        : null,
      statusCounts
    },
    orders
  });
}
