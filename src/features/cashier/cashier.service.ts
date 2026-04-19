import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";

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

function sortByTimestampDesc<T extends { createdAt?: string; updatedAt?: string; paidAt?: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.paidAt ?? left.updatedAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.paidAt ?? right.updatedAt ?? right.createdAt ?? 0).getTime();

    return rightTime - leftTime;
  });
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values.filter((value): value is string => Boolean(value));

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

export async function listSessionsForCashier(branchId?: string, branchIds?: string[] | null) {
  const store = readStore();
  const allowedBranchIds = branchIds ? new Set(branchIds) : null;
  const sessions = sortByOpenedAtAsc(
    store.sessions.filter(
      (session) =>
        session.status === "OPEN" &&
        (!branchId || session.branchId === branchId) &&
        (!allowedBranchIds || allowedBranchIds.has(session.branchId))
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
        status: session.status,
        tableName: table.name,
        branchName: branch.name,
        openedAt: session.openedAt,
        totalAmount: session.totalAmount,
        paidAmount: session.paidAmount,
        remainingAmount: session.remainingAmount,
        guestCount: guests.length,
        total: Number(centsToDecimalString(totalCents))
      };
    })
  );
}

export async function listReceiptsForCashier(branchId?: string, branchIds?: string[] | null) {
  const store = readStore();
  const allowedBranchIds = branchIds ? new Set(branchIds) : null;
  const paidPaymentSessions = sortByTimestampDesc(
    store.paymentSessions.filter((paymentSession) => paymentSession.status === PaymentSessionStatus.PAID)
  );

  return cloneValue(
    paidPaymentSessions
      .map((paymentSession) => {
        const invoice = store.invoices.find((entry) => entry.id === paymentSession.invoiceId);
        const session = store.sessions.find((entry) => entry.id === paymentSession.sessionId);

        if (!invoice || !session) {
          return null;
        }

        if (branchId && session.branchId !== branchId) {
          return null;
        }

        if (allowedBranchIds && !allowedBranchIds.has(session.branchId)) {
          return null;
        }

        const branch = store.branches.find((entry) => entry.id === session.branchId);
        const table = store.tables.find((entry) => entry.id === session.tableId);
        const guests = getSessionGuests(store, session.id);
        const guestMap = new Map(guests.map((guest) => [guest.id, guest]));
        const shares = sortByTimestampDesc(store.paymentShares.filter((share) => share.paymentSessionId === paymentSession.id));
        const payments = sortByTimestampDesc(store.payments.filter((payment) => payment.invoiceId === invoice.id));
        const lines = store.invoiceLines.filter((line) => line.invoiceId === invoice.id);
        const paidShares = shares.filter((share) => share.status === PaymentShareStatus.PAID);
        const tipCents = sumCents(paidShares.map((share) => toCents(share.tip)));
        const collectedCents =
          payments.length > 0
            ? sumCents(payments.map((payment) => toCents(payment.amount)))
            : sumCents(paidShares.map((share) => toCents(share.amount) + toCents(share.tip)));
        const paidAt =
          latestTimestamp([
            session.closedAt,
            paymentSession.updatedAt,
            ...paidShares.map((share) => share.paidAt),
            ...payments.map((payment) => payment.paidAt)
          ]) ?? paymentSession.updatedAt;

        return {
          id: paymentSession.id,
          invoiceId: invoice.id,
          sessionId: session.id,
          splitMode: invoice.splitMode,
          status: paymentSession.status,
          currency: paymentSession.currency,
          total: invoice.total,
          paidAmount: paymentSession.paidAmount,
          remainingAmount: paymentSession.remainingAmount,
          tipAmount: centsToDecimalString(tipCents),
          collectedAmount: centsToDecimalString(collectedCents),
          createdAt: invoice.createdAt,
          paidAt,
          branch: branch
            ? {
                id: branch.id,
                name: branch.name
              }
            : null,
          table: table
            ? {
                id: table.id,
                name: table.name,
                code: table.code
              }
            : null,
          guests: guests.map((guest) => ({
            id: guest.id,
            displayName: guest.displayName
          })),
          lines: lines.map((line) => ({
            id: line.id,
            label: line.label,
            amount: line.amount,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            guestId: line.guestId,
            guestName: line.guestId ? guestMap.get(line.guestId)?.displayName ?? null : null
          })),
          shares: shares.map((share) => ({
            id: share.id,
            payerLabel: share.payerLabel,
            guestId: share.guestId,
            guestName: share.guestId ? guestMap.get(share.guestId)?.displayName ?? null : null,
            amount: share.amount,
            tip: share.tip,
            totalCharged: centsToDecimalString(toCents(share.amount) + toCents(share.tip)),
            status: share.status,
            provider: share.provider,
            providerPaymentId: share.providerPaymentId,
            paidAt: share.paidAt
          })),
          payments: payments.map((payment) => ({
            id: payment.id,
            guestId: payment.guestId,
            guestName: payment.guestId ? guestMap.get(payment.guestId)?.displayName ?? null : null,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            reference: payment.reference,
            paidAt: payment.paidAt,
            createdAt: payment.createdAt
          }))
        };
      })
      .filter((receipt): receipt is NonNullable<typeof receipt> => Boolean(receipt))
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
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
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
      label: line.label,
      itemName: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice
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
      paymentSession: null,
      session: {
        ...session,
        table: cloneValue(table),
        guests: cloneValue(guests)
      }
    });
  });
}
