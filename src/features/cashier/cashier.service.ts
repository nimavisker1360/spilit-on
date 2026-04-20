import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/features/cashier/cashier.schemas";
import { centsToDecimalString, sumCents, toCents } from "@/lib/currency";

function distributeEqual(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, i) => (i < remainder ? base + 1 : base));
}

export async function listSessionsForCashier(branchId?: string, branchIds?: string[] | null) {
  const sessions = await prisma.tableSession.findMany({
    where: {
      status: "OPEN",
      ...(branchId ? { branchId } : {}),
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    },
    include: {
      table: true,
      branch: { select: { id: true, name: true } },
      guests: true,
      orders: {
        include: {
          items: { where: { status: { not: "VOID" } } },
        },
      },
    },
    orderBy: { openedAt: "asc" },
  });

  return sessions.map((session) => {
    const totalCents = sumCents(
      session.orders.flatMap((order) =>
        order.items.map((item) => toCents(item.unitPrice.toString()) * item.quantity)
      )
    );

    return {
      id: session.id,
      status: session.status,
      tableName: session.table.name,
      branchName: session.branch.name,
      openedAt: session.openedAt,
      totalAmount: session.totalAmount.toString(),
      paidAmount: session.paidAmount.toString(),
      remainingAmount: session.remainingAmount.toString(),
      guestCount: session.guests.length,
      total: Number(centsToDecimalString(totalCents)),
    };
  });
}

export async function listReceiptsForCashier(branchId?: string, branchIds?: string[] | null) {
  const paymentSessions = await prisma.paymentSession.findMany({
    where: {
      status: "PAID",
      ...(branchId ? { session: { branchId } } : {}),
      ...(branchIds ? { session: { branchId: { in: branchIds } } } : {}),
    },
    include: {
      invoice: {
        include: {
          lines: {
            include: { orderItem: true, guest: true },
          },
          splits: { include: { guest: true } },
          payments: true,
        },
      },
      session: {
        include: {
          table: true,
          branch: { select: { id: true, name: true } },
          guests: true,
        },
      },
      shares: { include: { guest: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return paymentSessions.map((ps) => {
    const paidShares = ps.shares.filter((s) => s.status === PaymentShareStatus.PAID);
    const tipCents = sumCents(paidShares.map((s) => toCents(s.tip.toString())));
    const collectedCents =
      ps.invoice.payments.length > 0
        ? sumCents(ps.invoice.payments.map((p) => toCents(p.amount.toString())))
        : sumCents(paidShares.map((s) => toCents(s.amount.toString()) + toCents(s.tip.toString())));

    return {
      id: ps.id,
      invoiceId: ps.invoice.id,
      sessionId: ps.session.id,
      splitMode: ps.invoice.splitMode,
      status: ps.status,
      currency: ps.currency,
      total: ps.invoice.total.toString(),
      paidAmount: ps.paidAmount.toString(),
      remainingAmount: ps.remainingAmount.toString(),
      tipAmount: centsToDecimalString(tipCents),
      collectedAmount: centsToDecimalString(collectedCents),
      createdAt: ps.invoice.createdAt,
      paidAt: ps.updatedAt,
      branch: { id: ps.session.branch.id, name: ps.session.branch.name },
      table: { id: ps.session.table.id, name: ps.session.table.name, code: ps.session.table.code },
      guests: ps.session.guests.map((g) => ({ id: g.id, displayName: g.displayName })),
      lines: ps.invoice.lines.map((line) => ({
        id: line.id,
        label: line.label,
        amount: line.amount.toString(),
        itemName: line.orderItem.itemName,
        quantity: line.orderItem.quantity,
        unitPrice: line.orderItem.unitPrice.toString(),
        guestId: line.guestId,
        guestName: line.guest?.displayName ?? null,
      })),
      shares: ps.shares.map((share) => ({
        id: share.id,
        payerLabel: share.payerLabel,
        guestId: share.guestId,
        guestName: share.guest?.displayName ?? null,
        amount: share.amount.toString(),
        tip: share.tip.toString(),
        totalCharged: centsToDecimalString(toCents(share.amount.toString()) + toCents(share.tip.toString())),
        status: share.status,
        provider: share.provider,
        providerPaymentId: share.providerPaymentId,
        paidAt: share.paidAt,
      })),
      payments: ps.invoice.payments.map((p) => ({
        id: p.id,
        guestId: p.guestId,
        guestName: ps.session.guests.find((g) => g.id === p.guestId)?.displayName ?? null,
        amount: p.amount.toString(),
        currency: p.currency,
        method: p.method,
        status: p.status,
        reference: p.reference,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    };
  });
}

export async function createInvoice(input: CreateInvoiceInput) {
  const parsed = createInvoiceSchema.parse(input);

  const session = await prisma.tableSession.findUnique({
    where: { id: parsed.sessionId },
    include: { table: true, guests: true },
  });

  if (!session || session.status !== "OPEN") throw new Error("Session is not open");
  if (!session.table) throw new Error("Session table not found");

  const orders = await prisma.order.findMany({
    where: { sessionId: session.id },
    include: { items: { include: { guest: true } } },
  });

  const allItems = orders.flatMap((o) => o.items).filter((item) => item.status !== "VOID");
  if (allItems.length === 0) throw new Error("No billable items found in this session");

  const lineDrafts = allItems.map((item) => ({
    orderItemId: item.id,
    guestId: item.guestId,
    label: `${item.itemName} x${item.quantity}`,
    amountCents: toCents(item.unitPrice.toString()) * item.quantity,
  }));

  const totalCents = sumCents(lineDrafts.map((l) => l.amountCents));
  const guestMap = new Map(session.guests.map((g) => [g.id, g]));

  let assignments: Array<{ guestId: string; payerLabel: string; amountCents: number }> = [];

  if (parsed.splitMode === SplitMode.FULL_BY_ONE) {
    if (!parsed.payerGuestId) throw new Error("payerGuestId is required for FULL_BY_ONE split");
    const payer = guestMap.get(parsed.payerGuestId);
    if (!payer) throw new Error("Selected payer does not belong to this session");
    assignments = [{ guestId: payer.id, payerLabel: payer.displayName, amountCents: totalCents }];
  }

  if (parsed.splitMode === SplitMode.EQUAL) {
    if (session.guests.length === 0) throw new Error("Equal split requires at least one guest");
    const shares = distributeEqual(totalCents, session.guests.length);
    assignments = session.guests.map((g, i) => ({
      guestId: g.id,
      payerLabel: g.displayName,
      amountCents: shares[i]!,
    }));
  }

  if (parsed.splitMode === SplitMode.BY_GUEST_ITEMS) {
    const grouped = new Map<string, number>();
    for (const line of lineDrafts) {
      grouped.set(line.guestId, (grouped.get(line.guestId) ?? 0) + line.amountCents);
    }
    assignments = Array.from(grouped.entries()).map(([guestId, amountCents]) => ({
      guestId,
      payerLabel: guestMap.get(guestId)?.displayName ?? "Unknown Guest",
      amountCents,
    }));
  }

  return prisma.invoice.create({
    data: {
      sessionId: session.id,
      splitMode: parsed.splitMode,
      total: centsToDecimalString(totalCents),
      lines: {
        create: lineDrafts.map((line) => ({
          orderItemId: line.orderItemId,
          guestId: line.guestId,
          amount: centsToDecimalString(line.amountCents),
          label: line.label,
        })),
      },
      splits: {
        create: assignments.map((a) => ({
          guestId: a.guestId,
          payerLabel: a.payerLabel,
          amount: centsToDecimalString(a.amountCents),
        })),
      },
    },
    include: {
      lines: { include: { guest: true } },
      splits: { include: { guest: true } },
      session: { include: { table: true, guests: true } },
    },
  });
}
