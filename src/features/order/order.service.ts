import { type KitchenItemStatus, OrderSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centsToDecimalString, toCents } from "@/lib/currency";
import {
  createCustomerOrderSchema,
  createWaiterOrderSchema,
  type CreateCustomerOrderInput,
  type CreateWaiterOrderInput,
} from "@/features/order/order.schemas";

type GuestStatusCounts = {
  PENDING: number;
  IN_PROGRESS: number;
  READY: number;
  SERVED: number;
  VOID: number;
};

export type GuestOrderFeedDetail = {
  table: { id: string; name: string; code: string };
  session: { id: string; openedAt: Date } | null;
  identifiedGuest: { id: string; displayName: string } | null;
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
    createdAt: Date;
    subtotal: string;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      note: string | null;
      createdAt: Date;
      status: KitchenItemStatus;
    }>;
  }>;
};

type CreateOrderInternalInput = {
  sessionId: string;
  source: OrderSource;
  placedByGuestId?: string;
  note?: string;
  items: Array<{ menuItemId: string; quantity: number; guestId?: string; note?: string }>;
};

async function createOrderInternal(input: CreateOrderInternalInput) {
  const session = await prisma.tableSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.status !== "OPEN") throw new Error("Session is not open");

  const guests = await prisma.guest.findMany({ where: { sessionId: session.id } });
  const guestIdSet = new Set(guests.map((g) => g.id));

  if (input.placedByGuestId && !guestIdSet.has(input.placedByGuestId)) {
    throw new Error("Placed-by guest is not part of this session");
  }

  const menuItemIds = [...new Set(input.items.map((i) => i.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, branchId: session.branchId, isAvailable: true },
  });

  if (menuItems.length !== menuItemIds.length) throw new Error("One or more menu items are unavailable");

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  const order = await prisma.order.create({
    data: {
      branchId: session.branchId,
      sessionId: session.id,
      source: input.source,
      status: "PENDING",
      placedByGuestId: input.placedByGuestId ?? null,
      note: input.note ?? null,
      items: {
        create: input.items.map((item) => {
          const assignedGuestId = item.guestId ?? input.placedByGuestId;
          if (!assignedGuestId) throw new Error("Each order item must be assigned to a guest");
          if (!guestIdSet.has(assignedGuestId)) throw new Error("One or more guest assignments are invalid");

          const menuItem = menuItemMap.get(item.menuItemId);
          if (!menuItem) throw new Error("Menu item mismatch");

          return {
            menuItemId: menuItem.id,
            itemName: menuItem.name,
            quantity: item.quantity,
            guestId: assignedGuestId,
            unitPrice: menuItem.price,
            note: item.note ?? null,
            status: "PENDING" as const,
          };
        }),
      },
    },
    include: {
      items: { include: { guest: true } },
      session: { include: { table: true } },
    },
  });

  return order;
}

export async function placeCustomerOrder(input: CreateCustomerOrderInput) {
  const parsed = createCustomerOrderSchema.parse(input);
  return createOrderInternal({
    sessionId: parsed.sessionId,
    source: "CUSTOMER",
    placedByGuestId: parsed.guestId,
    note: parsed.note,
    items: parsed.items,
  });
}

export async function placeWaiterOrder(input: CreateWaiterOrderInput) {
  const parsed = createWaiterOrderSchema.parse(input);
  return createOrderInternal({
    sessionId: parsed.sessionId,
    source: "WAITER",
    note: parsed.note,
    items: parsed.items,
  });
}

export async function getSessionOrderFeed(sessionId: string) {
  return prisma.order.findMany({
    where: { sessionId },
    include: {
      items: {
        include: { guest: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGuestOrderFeed(
  tableCode: string,
  lookup: { guestId?: string; sessionId?: string }
): Promise<GuestOrderFeedDetail> {
  const table = await prisma.table.findUnique({ where: { code: tableCode.trim() } });
  if (!table || table.status === "OUT_OF_SERVICE") throw new Error("Table not found");

  const baseDetail: GuestOrderFeedDetail = {
    table: { id: table.id, name: table.name, code: table.code },
    session: null,
    identifiedGuest: null,
    summary: {
      guestName: null,
      itemCount: 0,
      subtotal: "0.00",
      unpaidAmount: null,
      statusCounts: { PENDING: 0, IN_PROGRESS: 0, READY: 0, SERVED: 0, VOID: 0 },
    },
    orders: [],
  };

  const activeSession = await prisma.tableSession.findFirst({
    where: { tableId: table.id, status: "OPEN" },
  });

  if (!activeSession) return baseDetail;
  if (lookup.sessionId && lookup.sessionId !== activeSession.id) return baseDetail;

  baseDetail.session = { id: activeSession.id, openedAt: activeSession.openedAt };

  if (!lookup.guestId) return baseDetail;

  const guest = await prisma.guest.findFirst({
    where: { id: lookup.guestId, sessionId: activeSession.id },
  });
  if (!guest) return baseDetail;

  const orders = await prisma.order.findMany({
    where: { sessionId: activeSession.id },
    include: {
      items: {
        where: { guestId: guest.id },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const statusCounts: GuestStatusCounts = { PENDING: 0, IN_PROGRESS: 0, READY: 0, SERVED: 0, VOID: 0 };
  let itemCount = 0;
  let subtotalCents = 0;

  const ordersOut = orders
    .map((order) => {
      if (!order.items.length) return null;
      let orderSubtotalCents = 0;

      const items = order.items.map((item) => {
        statusCounts[item.status] += 1;
        itemCount += item.quantity;
        const lineCents = toCents(item.unitPrice.toString()) * item.quantity;
        if (item.status !== "VOID") {
          subtotalCents += lineCents;
          orderSubtotalCents += lineCents;
        }
        return {
          id: item.id,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          lineTotal: centsToDecimalString(lineCents),
          note: item.note,
          createdAt: item.createdAt,
          status: item.status,
        };
      });

      return {
        id: order.id,
        source: order.source,
        createdAt: order.createdAt,
        subtotal: centsToDecimalString(orderSubtotalCents),
        items,
      };
    })
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .reverse();

  const paymentSession = await prisma.paymentSession.findFirst({
    where: { sessionId: activeSession.id },
    orderBy: { createdAt: "desc" },
  });

  const paymentShare = paymentSession
    ? await prisma.paymentShare.findFirst({
        where: { paymentSessionId: paymentSession.id, guestId: guest.id },
      })
    : null;

  return {
    ...baseDetail,
    identifiedGuest: { id: guest.id, displayName: guest.displayName },
    summary: {
      guestName: guest.displayName,
      itemCount,
      subtotal: centsToDecimalString(subtotalCents),
      unpaidAmount: paymentShare
        ? paymentShare.status === "PAID"
          ? "0.00"
          : paymentShare.status === "CANCELLED"
          ? null
          : paymentShare.amount.toString()
        : null,
      statusCounts,
    },
    orders: ordersOut,
  };
}
