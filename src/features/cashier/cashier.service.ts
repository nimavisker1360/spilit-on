import { SplitMode } from "@prisma/client";

import { createInvoiceSchema, type CreateInvoiceInput } from "@/features/cashier/cashier.schemas";
import { centsToDecimalString, sumCents, toCents } from "@/lib/currency";
import {
  cloneValue,
  getOrderItems,
  getSessionGuests,
  makeId,
  readStore,
  sortByOpenedAtAsc,
  updateStore
} from "@/lib/local-store";

function distributeEqual(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  return Array.from({ length: count }, (_, index) => (index < remainder ? base + 1 : base));
}

export async function listSessionsForCashier(branchId?: string) {
  const store = readStore();
  const sessions = sortByOpenedAtAsc(
    store.sessions.filter(
      (session) => session.status === "OPEN" && (!branchId || session.branchId === branchId)
    )
  );

  return cloneValue(
    sessions.map((session) => {
      const table = store.tables.find((entry) => entry.id === session.tableId);
      const branch = store.branches.find((entry) => entry.id === session.branchId);
      const guests = getSessionGuests(store, session.id);
      const orders = store.orders.filter((order) => order.sessionId === session.id);

      if (!table || !branch) {
        throw new Error("Cashier session relation mismatch");
      }

      const totalCents = sumCents(
        orders.flatMap((order) =>
          getOrderItems(store, order.id)
            .filter((item) => item.status !== "VOID")
            .map((item) => toCents(item.unitPrice) * item.quantity)
        )
      );

      return {
        id: session.id,
        tableName: table.name,
        branchName: branch.name,
        openedAt: session.openedAt,
        guestCount: guests.length,
        total: Number(centsToDecimalString(totalCents))
      };
    })
  );
}

export async function createInvoice(input: CreateInvoiceInput) {
  const parsed = createInvoiceSchema.parse(input);

  return updateStore((store) => {
    const session = store.sessions.find((entry) => entry.id === parsed.sessionId);

    if (!session || session.status !== "OPEN") {
      throw new Error("Session is not open");
    }

    const table = store.tables.find((entry) => entry.id === session.tableId);
    const guests = getSessionGuests(store, session.id);
    const orders = store.orders
      .filter((order) => order.sessionId === session.id)
      .map((order) => ({
        ...order,
        items: getOrderItems(store, order.id).map((item) => ({
          ...item,
          guest: cloneValue(guests.find((guest) => guest.id === item.guestId))
        }))
      }));

    if (!table) {
      throw new Error("Session table not found");
    }

    const allItems = orders.flatMap((order) => order.items).filter((item) => item.status !== "VOID");

    if (allItems.length === 0) {
      throw new Error("No billable items found in this session");
    }

    const lineDrafts = allItems.map((item) => {
      const amountCents = toCents(item.unitPrice) * item.quantity;
      return {
        orderItemId: item.id,
        guestId: item.guestId,
        label: `${item.itemName} x${item.quantity}`,
        amountCents
      };
    });

    const totalCents = sumCents(lineDrafts.map((line) => line.amountCents));
    const guestMap = new Map(guests.map((guest) => [guest.id, guest]));

    let assignments: Array<{ guestId: string; payerLabel: string; amountCents: number }> = [];

    if (parsed.splitMode === SplitMode.FULL_BY_ONE) {
      if (!parsed.payerGuestId) {
        throw new Error("payerGuestId is required for FULL_BY_ONE split");
      }

      const payer = guestMap.get(parsed.payerGuestId);

      if (!payer) {
        throw new Error("Selected payer does not belong to this session");
      }

      assignments = [
        {
          guestId: payer.id,
          payerLabel: payer.displayName,
          amountCents: totalCents
        }
      ];
    }

    if (parsed.splitMode === SplitMode.EQUAL) {
      if (guests.length === 0) {
        throw new Error("Equal split requires at least one guest");
      }

      const shares = distributeEqual(totalCents, guests.length);

      assignments = guests.map((guest, index) => ({
        guestId: guest.id,
        payerLabel: guest.displayName,
        amountCents: shares[index]
      }));
    }

    if (parsed.splitMode === SplitMode.BY_GUEST_ITEMS) {
      const grouped = new Map<string, number>();

      for (const line of lineDrafts) {
        const current = grouped.get(line.guestId) ?? 0;
        grouped.set(line.guestId, current + line.amountCents);
      }

      assignments = Array.from(grouped.entries()).map(([guestId, amountCents]) => {
        const guest = guestMap.get(guestId);
        return {
          guestId,
          payerLabel: guest?.displayName ?? "Unknown Guest",
          amountCents
        };
      });
    }

    const invoice = {
      id: makeId("invoice"),
      sessionId: session.id,
      splitMode: parsed.splitMode,
      total: centsToDecimalString(totalCents),
      createdAt: new Date().toISOString()
    };

    const lines = lineDrafts.map((line) => ({
      id: makeId("invoice_line"),
      invoiceId: invoice.id,
      orderItemId: line.orderItemId,
      guestId: line.guestId,
      amount: centsToDecimalString(line.amountCents),
      label: line.label
    }));

    const splits = assignments.map((assignment) => ({
      id: makeId("invoice_split"),
      invoiceId: invoice.id,
      guestId: assignment.guestId,
      payerLabel: assignment.payerLabel,
      amount: centsToDecimalString(assignment.amountCents)
    }));

    store.invoices.push(invoice);
    store.invoiceLines.push(...lines);
    store.invoiceAssignments.push(...splits);

    return cloneValue({
      ...invoice,
      lines: lines.map((line) => ({
        ...line,
        guest: line.guestId ? cloneValue(guestMap.get(line.guestId) ?? null) : null
      })),
      splits: splits.map((split) => ({
        ...split,
        guest: split.guestId ? cloneValue(guestMap.get(split.guestId) ?? null) : null
      })),
      session: {
        ...session,
        table: cloneValue(table),
        guests: cloneValue(guests)
      }
    });
  });
}
