import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PaymentSessionStatus, PaymentShareStatus, PaymentStatus, SessionStatus, SplitMode, TableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centsToDecimalString, toCents } from "@/lib/currency";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { createMockPaymentCharge, MOCK_GUEST_PAYMENT_PROVIDER } from "@/features/payment/mock-payment.service";
import {
  applyGuestPaymentSharePaymentSchema,
  applyCashierPaymentShareActionSchema,
  createPaymentSessionFromInvoiceSchema,
  generatePaymentSessionFromInvoiceSchema,
  paymentSessionRecordSchema,
  paymentShareRecordSchema
} from "@/features/payment/payment.schemas";
import type {
  CashierPaymentShareAction,
  CreatePaymentSessionFromInvoiceInput,
  InvoicePaymentBundle
} from "@/features/payment/payment.types";

// ─── Constants ───────────────────────────────────────────────────────────────

const CASH_PROVIDER = "CASH_DESK";
const CARD_PROVIDER = "CARD_POS";
const ONLINE_PROVIDER = "MOCK_ONLINE_LINK";
const MOCK_SETTLEMENT_PROVIDER = "MOCK_SETTLEMENT";

// ─── Pure Helpers ────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function buildMockPaymentUrl(paymentShareId: string, token: string): string {
  return `${getPublicAppBaseUrl()}/pay/${encodeURIComponent(paymentShareId)}?token=${encodeURIComponent(token)}`;
}

function formatFullPaymentLabel(tableName: string): string {
  const trimmed = tableName.trim();
  if (!trimmed) return "Full bill";
  if (/^table\b/i.test(trimmed) || /^masa\b/i.test(trimmed)) return `${trimmed} - Full bill`;
  return `Table ${trimmed} - Full bill`;
}

function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldGuestName(value: string): string {
  return normalizeGuestName(value).toLocaleLowerCase("tr-TR");
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MockPaymentLinkAction = "COMPLETE" | "FAIL";

type GuestPaymentEntryShare = {
  id: string;
  userId: string | null;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  paymentUrl: string | null;
  provider: string | null;
  paidAt: string | null;
};

type GuestPaymentEntryLine = {
  id: string;
  label: string;
  amount: string;
  itemName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  guestId: string | null;
  guestName: string | null;
};

type GuestPaymentLookupInput = {
  guestId?: string;
  guestName?: string;
  sessionId?: string;
};

type GuestPaymentEntryGuestCandidate = {
  id: string;
  displayName: string;
  hasPaymentShare: boolean;
  shareAmount: string | null;
  shareStatus: PaymentShareStatus | null;
};

type GuestPaymentEntryMatchSource =
  | "EXACT_GUEST_ID"
  | "NORMALIZED_NAME"
  | "CASE_INSENSITIVE_NORMALIZED_NAME"
  | "ALIAS"
  | null;

type GuestPaymentEntryMapping = {
  matchSource: GuestPaymentEntryMatchSource;
  requiresSelection: boolean;
  message: string | null;
  payMyShareDisabledReason: string | null;
  candidates: GuestPaymentEntryGuestCandidate[];
};

type GuestPaymentEntryDebug = {
  joinedCustomer: {
    guestId: string | null;
    guestName: string | null;
    sessionId: string | null;
    sessionScoped: boolean;
  };
  sessionGuests: Array<{ guestId: string; displayName: string }>;
  addAnotherGuestAvailable: boolean;
  detectedGuestCandidates: Array<{
    guestId: string;
    displayName: string;
    strategy: Exclude<GuestPaymentEntryMatchSource, null>;
  }>;
  finalMatchedGuestId: string | null;
  matchedPaymentShareId: string | null;
};

type JoinedGuestSummary = { id: string; displayName: string };

export type GuestPaymentEntryDetail = {
  table: { id: string; name: string; code: string };
  session: {
    id: string;
    status: SessionStatus;
    openedAt: string;
    closedAt: string | null;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    guests: Array<{ id: string; displayName: string }>;
  } | null;
  identifiedGuest: { id: string; displayName: string } | null;
  mapping: GuestPaymentEntryMapping;
  paymentSession: {
    id: string;
    splitMode: SplitMode;
    status: PaymentSessionStatus;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    currency: string;
    fullBillOptionEnabled: boolean;
    myShare: GuestPaymentEntryShare | null;
    fullBillShare: GuestPaymentEntryShare | null;
    shares: GuestPaymentEntryShare[];
    invoiceLines: GuestPaymentEntryLine[];
  } | null;
  debug?: GuestPaymentEntryDebug;
};

// ─── Prisma Include Shapes ────────────────────────────────────────────────────

const shareWithGuestInclude = {
  guest: true
} as const;

const paymentSessionFullInclude = {
  shares: { include: shareWithGuestInclude },
  session: {
    include: {
      table: true,
      guests: true
    }
  }
} as const;

type ShareWithGuest = Prisma.PaymentShareGetPayload<{ include: typeof shareWithGuestInclude }>;
type PaymentSessionFull = Prisma.PaymentSessionGetPayload<{ include: typeof paymentSessionFullInclude }>;

// ─── Mapper Helpers ───────────────────────────────────────────────────────────

function shareToEntryShare(share: ShareWithGuest): GuestPaymentEntryShare {
  return {
    id: share.id,
    userId: share.userId,
    guestId: share.guestId,
    payerLabel: share.payerLabel,
    amount: share.amount.toString(),
    tip: share.tip.toString(),
    status: share.status,
    paymentUrl: share.paymentUrl,
    provider: share.provider,
    paidAt: share.paidAt ? share.paidAt.toISOString() : null
  };
}

// ─── Settlement Synchronization ───────────────────────────────────────────────

async function syncSettlementState(
  tx: Prisma.TransactionClient,
  paymentSessionId: string
): Promise<PaymentSessionFull> {
  const ps = await tx.paymentSession.findUniqueOrThrow({
    where: { id: paymentSessionId }
  });

  const shares = await tx.paymentShare.findMany({
    where: { paymentSessionId }
  });

  const totalCents = toCents(ps.totalAmount.toString());
  const paidCents = shares
    .filter((s) => s.status === PaymentShareStatus.PAID)
    .reduce((sum, s) => sum + toCents(s.amount.toString()), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);

  let newStatus: PaymentSessionStatus = PaymentSessionStatus.OPEN;
  if (remainingCents === 0 && shares.length > 0) {
    newStatus = PaymentSessionStatus.PAID;
  } else if (paidCents > 0) {
    newStatus = PaymentSessionStatus.PARTIALLY_PAID;
  }

  await tx.paymentSession.update({
    where: { id: paymentSessionId },
    data: {
      paidAmount: centsToDecimalString(paidCents),
      remainingAmount: centsToDecimalString(remainingCents),
      status: newStatus
    }
  });

  const tableSession = await tx.tableSession.findUnique({
    where: { id: ps.sessionId }
  });

  if (tableSession) {
    const now = new Date();
    const sessionData: Prisma.TableSessionUpdateInput = {
      totalAmount: ps.totalAmount,
      paidAmount: centsToDecimalString(paidCents),
      remainingAmount: centsToDecimalString(remainingCents)
    };

    if (newStatus === PaymentSessionStatus.PAID) {
      sessionData.status = SessionStatus.CLOSED;
      sessionData.closedAt = tableSession.closedAt ?? now;
      sessionData.readyToCloseAt = tableSession.readyToCloseAt ?? now;
    } else if (tableSession.status === SessionStatus.OPEN) {
      sessionData.readyToCloseAt = null;
      sessionData.closedAt = null;
    }

    await tx.tableSession.update({ where: { id: ps.sessionId }, data: sessionData });

    if (newStatus === PaymentSessionStatus.PAID) {
      await tx.table.update({
        where: { id: tableSession.tableId },
        data: { status: TableStatus.AVAILABLE }
      });
    }
  }

  return tx.paymentSession.findUniqueOrThrow({
    where: { id: paymentSessionId },
    include: paymentSessionFullInclude
  });
}

// ─── Share Resolution Helpers ─────────────────────────────────────────────────

function paymentShareSelectionPriority(status: PaymentShareStatus): number {
  if (status === PaymentShareStatus.UNPAID) return 0;
  if (status === PaymentShareStatus.PENDING) return 1;
  if (status === PaymentShareStatus.PAID) return 2;
  if (status === PaymentShareStatus.FAILED) return 3;
  return 4;
}

function sortSharesForSelection(shares: ShareWithGuest[]): ShareWithGuest[] {
  return [...shares].sort((a, b) => {
    const pd = paymentShareSelectionPriority(a.status) - paymentShareSelectionPriority(b.status);
    if (pd !== 0) return pd;
    const ud = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (ud !== 0) return ud;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

function resolveGuestPaymentShare(
  shares: ShareWithGuest[],
  guest: JoinedGuestSummary | null
): ShareWithGuest | null {
  if (!guest) return null;

  const exactMatches = shares.filter((s) => s.guestId === guest.id);
  if (exactMatches.length > 0) return sortSharesForSelection(exactMatches)[0] ?? null;

  const normalizedName = normalizeGuestName(guest.displayName);
  if (!normalizedName) return null;

  const normalizedMatches = shares.filter(
    (s) => !s.guestId && normalizeGuestName(s.payerLabel) === normalizedName
  );
  if (normalizedMatches.length === 1) return sortSharesForSelection(normalizedMatches)[0] ?? null;

  const foldedName = foldGuestName(guest.displayName);
  const foldedMatches = shares.filter(
    (s) => !s.guestId && foldGuestName(s.payerLabel) === foldedName
  );
  if (foldedMatches.length === 1) return sortSharesForSelection(foldedMatches)[0] ?? null;

  return null;
}

function resolveFullBillShare(
  splitMode: SplitMode,
  totalAmount: { toString(): string },
  shares: ShareWithGuest[]
): ShareWithGuest | null {
  if (shares.length === 0) return null;
  if (splitMode === SplitMode.FULL_BY_ONE) return shares[0] ?? null;

  const totalCents = toCents(totalAmount.toString());
  return shares.find((s) => toCents(s.amount.toString()) === totalCents) ?? null;
}

// ─── Guest Match Resolution ───────────────────────────────────────────────────

function resolveGuestMatch(
  joinedGuests: JoinedGuestSummary[],
  lookup: { guestId?: string; guestName?: string; sessionId?: string },
  activeSessionId: string
): {
  guest: JoinedGuestSummary | null;
  matchSource: GuestPaymentEntryMatchSource;
  detectedGuestCandidates: GuestPaymentEntryDebug["detectedGuestCandidates"];
  sessionScoped: boolean;
} {
  const normId = lookup.guestId?.trim() ?? "";
  const normName = normalizeGuestName(lookup.guestName ?? "");
  const foldedName = foldGuestName(lookup.guestName ?? "");
  const normSessionId = lookup.sessionId?.trim() ?? "";
  const sessionScoped = !normSessionId || normSessionId === activeSessionId;
  const candidates: GuestPaymentEntryDebug["detectedGuestCandidates"] = [];
  const seenKeys = new Set<string>();

  function push(strategy: Exclude<GuestPaymentEntryMatchSource, null>, guests: JoinedGuestSummary[]) {
    for (const g of guests) {
      const key = `${strategy}:${g.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({ guestId: g.id, displayName: g.displayName, strategy });
      }
    }
  }

  if (!sessionScoped) {
    return { guest: null, matchSource: null, detectedGuestCandidates: candidates, sessionScoped };
  }

  if (normId) {
    const g = joinedGuests.find((e) => e.id === normId) ?? null;
    if (g) {
      push("EXACT_GUEST_ID", [g]);
      return { guest: g, matchSource: "EXACT_GUEST_ID", detectedGuestCandidates: candidates, sessionScoped };
    }
  }

  if (normName) {
    const matches = joinedGuests.filter((g) => normalizeGuestName(g.displayName) === normName);
    push("NORMALIZED_NAME", matches);
    if (matches.length === 1) {
      return { guest: matches[0]!, matchSource: "NORMALIZED_NAME", detectedGuestCandidates: candidates, sessionScoped };
    }
  }

  if (foldedName) {
    const matches = joinedGuests.filter((g) => foldGuestName(g.displayName) === foldedName);
    push("CASE_INSENSITIVE_NORMALIZED_NAME", matches);
    if (matches.length === 1) {
      return { guest: matches[0]!, matchSource: "CASE_INSENSITIVE_NORMALIZED_NAME", detectedGuestCandidates: candidates, sessionScoped };
    }
  }

  return { guest: null, matchSource: null, detectedGuestCandidates: candidates, sessionScoped };
}

// ─── Exported: buildPaymentBundleForInvoice (pure, no DB) ────────────────────

export function buildPaymentBundleForInvoice(input: CreatePaymentSessionFromInvoiceInput): InvoicePaymentBundle {
  const parsed = createPaymentSessionFromInvoiceSchema.parse(input);
  const now = new Date().toISOString();

  const paymentSession = paymentSessionRecordSchema.parse({
    id: generateId("payment_session"),
    sessionId: parsed.sessionId,
    invoiceId: parsed.invoiceId,
    splitMode: parsed.splitMode,
    totalAmount: parsed.totalAmount,
    paidAmount: "0.00",
    remainingAmount: parsed.totalAmount,
    currency: parsed.currency,
    status: PaymentSessionStatus.OPEN,
    createdAt: now,
    updatedAt: now
  });

  const paymentShares = parsed.shares.map((share) =>
    paymentShareRecordSchema.parse({
      id: generateId("payment_share"),
      paymentSessionId: paymentSession.id,
      userId: share.userId ?? share.guestId,
      guestId: share.guestId,
      payerLabel: share.payerLabel,
      amount: share.amount,
      tip: "0.00",
      status: PaymentShareStatus.UNPAID,
      provider: null,
      providerPaymentId: null,
      providerConversationId: null,
      paymentUrl: null,
      qrPayload: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now
    })
  );

  return { paymentSession, paymentShares };
}

// ─── createPaymentSessionFromInvoice ─────────────────────────────────────────

export async function createPaymentSessionFromInvoice(invoiceId: string) {
  const { invoiceId: id } = generatePaymentSessionFromInvoiceSchema.parse({ invoiceId });

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      splits: { include: { guest: true } },
      paymentSession: { include: paymentSessionFullInclude },
      session: { include: { table: true } }
    }
  });

  if (!invoice) throw new Error("Invoice not found");

  if (invoice.paymentSession) {
    const updated = await prisma.$transaction((tx) =>
      syncSettlementState(tx, invoice.paymentSession!.id)
    );
    return { created: false, paymentSession: updated };
  }

  const tableName = invoice.session.table?.name ?? "";
  const shareData: Prisma.PaymentShareCreateWithoutPaymentSessionInput[] = (() => {
    if (invoice.splitMode === SplitMode.FULL_BY_ONE) {
      const a = invoice.splits[0] ?? null;
      return [
        {
          userId: a?.guestId ?? null,
          guestId: a?.guestId ?? null,
          guest: a?.guestId ? { connect: { id: a.guestId } } : undefined,
          payerLabel: a ? (a.guest?.displayName ?? a.payerLabel) : formatFullPaymentLabel(tableName),
          amount: invoice.total,
          tip: "0.00",
          status: PaymentShareStatus.UNPAID
        }
      ];
    }

    if (invoice.splits.length === 0) {
      throw new Error("Invoice has no split assignments");
    }

    return invoice.splits.map((a) => ({
      userId: a.guestId ?? null,
      guestId: a.guestId ?? null,
      guest: a.guestId ? { connect: { id: a.guestId } } : undefined,
      payerLabel: a.guest?.displayName ?? a.payerLabel,
      amount: a.amount,
      tip: "0.00",
      status: PaymentShareStatus.UNPAID
    }));
  })();

  const created = await prisma.paymentSession.create({
    data: {
      session: { connect: { id: invoice.sessionId } },
      invoice: { connect: { id: invoice.id } },
      splitMode: invoice.splitMode,
      totalAmount: invoice.total,
      paidAmount: "0.00",
      remainingAmount: invoice.total,
      currency: "TRY",
      status: PaymentSessionStatus.OPEN,
      shares: { create: shareData }
    },
    include: paymentSessionFullInclude
  });

  return { created: true, paymentSession: created };
}

// ─── applyCashierPaymentShareAction ──────────────────────────────────────────

export async function applyCashierPaymentShareAction(
  paymentShareId: string,
  action: CashierPaymentShareAction
) {
  const parsed = applyCashierPaymentShareActionSchema.parse({ paymentShareId, action });

  return prisma.$transaction(async (tx) => {
    const share = await tx.paymentShare.findUnique({
      where: { id: parsed.paymentShareId }
    });
    if (!share) throw new Error("Payment share not found.");

    const ps = await tx.paymentSession.findUnique({
      where: { id: share.paymentSessionId }
    });
    if (!ps) throw new Error("Payment session not found.");

    let message: string;

    if (
      parsed.action === "PAY_BY_CASH" ||
      parsed.action === "PAY_BY_CARD" ||
      parsed.action === "SEND_ONLINE_LINK"
    ) {
      if (share.status === PaymentShareStatus.PAID) {
        throw new Error("Bu odeme payi zaten tahsil edilmis.");
      }
      if (share.status === PaymentShareStatus.PENDING) {
        throw new Error("Bu odeme payi icin odeme zaten baslatilmis.");
      }

      const provider =
        parsed.action === "PAY_BY_CASH"
          ? CASH_PROVIDER
          : parsed.action === "PAY_BY_CARD"
            ? CARD_PROVIDER
            : ONLINE_PROVIDER;

      const providerPaymentId = generateId(
        parsed.action === "PAY_BY_CASH"
          ? "cash_payment"
          : parsed.action === "PAY_BY_CARD"
            ? "card_payment"
            : "online_payment"
      );

      let accessToken: string | null = null;
      let paymentUrl: string | null = null;

      if (parsed.action === "SEND_ONLINE_LINK") {
        accessToken = generateId("payment_link");
        paymentUrl = buildMockPaymentUrl(share.id, accessToken);
      }

      await tx.paymentShare.update({
        where: { id: share.id },
        data: {
          status: PaymentShareStatus.PENDING,
          provider,
          providerPaymentId,
          providerConversationId: accessToken,
          paymentUrl,
          qrPayload: paymentUrl,
          paidAt: null
        }
      });

      await tx.paymentAttempt.create({
        data: {
          paymentShare: { connect: { id: share.id } },
          provider,
          status: "PENDING",
          requestPayload: {
            action: parsed.action,
            paymentShareStatus: PaymentShareStatus.PENDING,
            amount: share.amount.toString()
          }
        }
      });

      message =
        parsed.action === "PAY_BY_CASH"
          ? "Nakit odemesi baslatildi. Odeme masasindan tamamlayin veya basarisiz isaretleyin."
          : parsed.action === "PAY_BY_CARD"
            ? "Kart odemesi baslatildi. Odeme masasindan tamamlayin veya basarisiz isaretleyin."
            : "Online odeme linki hazir.";
    } else if (parsed.action === "COMPLETE_PENDING_PAYMENT") {
      if (share.status !== PaymentShareStatus.PENDING) {
        throw new Error("Yalnizca bekleyen odeme paylari tamamlanabilir.");
      }

      const charge = createMockPaymentCharge({
        paymentShareId: share.id,
        userId: share.userId ?? share.guestId,
        amount: share.amount.toString(),
        tip: "0.00",
        currency: ps.currency
      });

      await tx.paymentShare.update({
        where: { id: share.id },
        data: {
          status: PaymentShareStatus.PAID,
          tip: charge.tip,
          providerPaymentId: share.providerPaymentId ?? charge.providerPaymentId,
          providerConversationId: share.providerConversationId ?? charge.providerConversationId,
          paidAt: new Date()
        }
      });

      await tx.payment.create({
        data: {
          invoiceId: ps.invoiceId,
          guestId: share.guestId ?? undefined,
          amount: charge.totalCharged,
          currency: ps.currency,
          method: share.provider ?? MOCK_SETTLEMENT_PROVIDER,
          status: PaymentStatus.COMPLETED,
          reference: share.providerPaymentId ?? charge.providerPaymentId,
          paidAt: new Date()
        }
      });

      await tx.paymentAttempt.create({
        data: {
          paymentShare: { connect: { id: share.id } },
          provider: share.provider ?? MOCK_SETTLEMENT_PROVIDER,
          status: "SUCCEEDED",
          requestPayload: {
            action: "COMPLETE_PENDING_PAYMENT",
            paymentShareStatus: "PENDING",
            amount: share.amount.toString(),
            tip: charge.tip,
            totalCharged: charge.totalCharged
          },
          callbackPayload: {
            paymentShareStatus: PaymentShareStatus.PAID,
            providerPaymentId: share.providerPaymentId ?? charge.providerPaymentId,
            paidAt: new Date().toISOString()
          }
        }
      });

      message =
        share.provider === ONLINE_PROVIDER
          ? "Online odeme tamamlandi."
          : "Odeme tamamlandi ve tahsil edildi.";
    } else if (parsed.action === "MARK_PAYMENT_FAILED") {
      if (share.status === PaymentShareStatus.PAID) {
        throw new Error("Tahsil edilmis odeme paylari basarisiz olarak isaretlenemez.");
      }
      if (share.status === PaymentShareStatus.FAILED) {
        const updatedPs = await tx.paymentSession.findUniqueOrThrow({
          where: { id: ps.id },
          include: paymentSessionFullInclude
        });
        const failedShare = updatedPs.shares.find((s) => s.id === share.id)!;
        return { action: parsed.action, message: "Bu odeme payi zaten basarisiz olarak isaretli.", paymentSession: updatedPs, paymentShare: failedShare };
      }

      const previousStatus = share.status;
      await tx.paymentShare.update({
        where: { id: share.id },
        data: {
          status: PaymentShareStatus.FAILED,
          tip: "0.00",
          paidAt: null,
          ...(share.provider !== ONLINE_PROVIDER
            ? { paymentUrl: null, qrPayload: null, providerConversationId: null }
            : {})
        }
      });

      await tx.paymentAttempt.create({
        data: {
          paymentShare: { connect: { id: share.id } },
          provider: share.provider ?? MOCK_SETTLEMENT_PROVIDER,
          status: "FAILED",
          requestPayload: {
            action: "MARK_PAYMENT_FAILED",
            paymentShareStatus: previousStatus
          },
          callbackPayload: { paymentShareStatus: PaymentShareStatus.FAILED },
          failureReason: "Mock odeme akisinda basarisiz olarak isaretlendi."
        }
      });

      message =
        previousStatus === PaymentShareStatus.PENDING
          ? "Bekleyen odeme basarisiz olarak isaretlendi."
          : "Odeme basarisiz olarak isaretlendi.";
    } else {
      throw new Error("Desteklenmeyen kasiyer odeme aksiyonu.");
    }

    const updatedPs = await syncSettlementState(tx, ps.id);
    const updatedShare = updatedPs.shares.find((s) => s.id === share.id);
    if (!updatedShare) throw new Error("Updated payment share not found");

    return {
      action: parsed.action,
      message,
      paymentSession: updatedPs,
      paymentShare: updatedShare
    };
  });
}

// ─── applyGuestPaymentSharePayment ────────────────────────────────────────────

export async function applyGuestPaymentSharePayment(input: {
  paymentShareId: string;
  userId?: string | null;
  guestId?: string | null;
  tip?: string;
}) {
  const parsed = applyGuestPaymentSharePaymentSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const share = await tx.paymentShare.findUnique({
      where: { id: parsed.paymentShareId }
    });
    if (!share) throw new Error("Payment share not found.");

    const ps = await tx.paymentSession.findUnique({
      where: { id: share.paymentSessionId }
    });
    if (!ps) throw new Error("Payment session not found.");

    const tableSession = await tx.tableSession.findUnique({
      where: { id: ps.sessionId }
    });

    if (ps.status === PaymentSessionStatus.PAID || tableSession?.status === SessionStatus.CLOSED) {
      throw new Error("This payment session is already closed.");
    }

    if (share.status === PaymentShareStatus.PAID) {
      throw new Error("This share has already been paid.");
    }

    if (
      share.status !== PaymentShareStatus.UNPAID &&
      share.status !== PaymentShareStatus.FAILED
    ) {
      throw new Error("A payment is already in progress for this share.");
    }

    if (share.guestId && parsed.guestId && share.guestId !== parsed.guestId) {
      throw new Error("This payment share belongs to another guest.");
    }

    const resolvedUserId = parsed.userId ?? parsed.guestId ?? share.userId ?? share.guestId ?? null;

    const charge = createMockPaymentCharge({
      paymentShareId: share.id,
      userId: resolvedUserId,
      amount: share.amount.toString(),
      tip: parsed.tip,
      currency: ps.currency
    });

    const now = new Date();

    await tx.paymentShare.update({
      where: { id: share.id },
      data: {
        userId: resolvedUserId,
        status: PaymentShareStatus.PAID,
        tip: charge.tip,
        provider: MOCK_GUEST_PAYMENT_PROVIDER,
        providerPaymentId: charge.providerPaymentId,
        providerConversationId: charge.providerConversationId,
        paymentUrl: null,
        qrPayload: null,
        paidAt: now
      }
    });

    await tx.payment.create({
      data: {
        invoiceId: ps.invoiceId,
        guestId: share.guestId ?? undefined,
        amount: charge.totalCharged,
        currency: ps.currency,
        method: MOCK_GUEST_PAYMENT_PROVIDER,
        status: PaymentStatus.COMPLETED,
        reference: charge.providerPaymentId,
        paidAt: now
      }
    });

    await tx.paymentAttempt.create({
      data: {
        paymentShare: { connect: { id: share.id } },
        provider: MOCK_GUEST_PAYMENT_PROVIDER,
        status: "SUCCEEDED",
        requestPayload: {
          action: "MOCK_GUEST_PAYMENT",
          userId: resolvedUserId,
          amount: charge.amount,
          tip: charge.tip,
          totalCharged: charge.totalCharged
        },
        callbackPayload: {
          paymentShareStatus: PaymentShareStatus.PAID,
          providerPaymentId: charge.providerPaymentId,
          paidAt: now.toISOString()
        }
      }
    });

    const updatedPs = await syncSettlementState(tx, ps.id);
    const updatedShare = updatedPs.shares.find((s) => s.id === share.id);
    if (!updatedShare) throw new Error("Updated payment share not found");

    return {
      message:
        updatedPs.status === PaymentSessionStatus.PAID
          ? "Payment completed. The table session is now closed."
          : "Payment completed.",
      paymentSession: updatedPs,
      paymentShare: updatedShare
    };
  });
}

// ─── getGuestPaymentEntry ─────────────────────────────────────────────────────

export async function getGuestPaymentEntry(
  tableCode: string,
  lookup: GuestPaymentLookupInput = {}
): Promise<GuestPaymentEntryDetail> {
  const normCode = tableCode.trim();
  if (!normCode) throw new Error("Table code is required.");

  const normLookup = {
    guestId: lookup.guestId?.trim() ?? "",
    guestName: lookup.guestName?.trim() ?? "",
    sessionId: lookup.sessionId?.trim() ?? ""
  };

  const table = await prisma.table.findUnique({ where: { code: normCode } });
  if (!table || table.status === "OUT_OF_SERVICE") throw new Error("Table not found");

  const tableBase = { id: table.id, name: table.name, code: table.code };

  const noSessionResult: GuestPaymentEntryDetail = {
    table: tableBase,
    session: null,
    identifiedGuest: null,
    mapping: {
      matchSource: null,
      requiresSelection: false,
      message: "This table has no live bill yet. Ask staff to open the table and send the bill from the POS.",
      payMyShareDisabledReason: "No live bill is available for this table yet.",
      candidates: []
    },
    paymentSession: null
  };

  const activeSession = await prisma.tableSession.findFirst({
    where: { tableId: table.id, status: SessionStatus.OPEN },
    include: { guests: true }
  });

  const closedSession =
    !activeSession && normLookup.sessionId
      ? await prisma.tableSession.findFirst({
          where: {
            id: normLookup.sessionId,
            tableId: table.id,
            status: SessionStatus.CLOSED,
            paymentSessions: { some: { status: PaymentSessionStatus.PAID } }
          },
          include: { guests: true }
        })
      : null;

  const visibleSession = activeSession ?? closedSession;

  if (!visibleSession) {
    if (process.env.NODE_ENV !== "production") {
      noSessionResult.debug = {
        joinedCustomer: {
          guestId: normLookup.guestId || null,
          guestName: normLookup.guestName || null,
          sessionId: normLookup.sessionId || null,
          sessionScoped: false
        },
        sessionGuests: [],
        addAnotherGuestAvailable: false,
        detectedGuestCandidates: [],
        finalMatchedGuestId: null,
        matchedPaymentShareId: null
      };
    }
    return noSessionResult;
  }

  const joinedGuests = visibleSession.guests.map((g) => ({ id: g.id, displayName: g.displayName }));
  const joinedGuestMap = new Map(joinedGuests.map((g) => [g.id, g]));
  const guestMatch = resolveGuestMatch(joinedGuests, normLookup, visibleSession.id);
  const identifiedGuest = guestMatch.guest ?? null;

  const latestPs = await prisma.paymentSession.findFirst({
    where: { sessionId: visibleSession.id },
    orderBy: { createdAt: "desc" },
    include: {
      shares: { include: { guest: true } },
      invoice: {
        include: {
          lines: {
            include: { orderItem: true, guest: true }
          }
        }
      }
    }
  });

  const sessionShape = {
    id: visibleSession.id,
    status: visibleSession.status,
    openedAt: visibleSession.openedAt.toISOString(),
    closedAt: visibleSession.closedAt ? visibleSession.closedAt.toISOString() : null,
    totalAmount: visibleSession.totalAmount.toString(),
    paidAmount: visibleSession.paidAmount.toString(),
    remainingAmount: visibleSession.remainingAmount.toString(),
    guests: joinedGuests
  };

  const baseGuestCandidates: GuestPaymentEntryGuestCandidate[] = joinedGuests.map((g) => ({
    id: g.id,
    displayName: g.displayName,
    hasPaymentShare: false,
    shareAmount: null,
    shareStatus: null
  }));

  if (!latestPs) {
    const requiresSelection = !identifiedGuest && joinedGuests.length > 0;
    const mappingMessage = identifiedGuest
      ? `You are matched as ${identifiedGuest.displayName}. Your share will appear here as soon as the bill is sent from the POS.`
      : joinedGuests.length > 0
        ? "Select your name to keep this phone linked to the bill before the live check arrives."
        : "Join the table with your name first. You can pay as soon as the bill is sent from the POS.";

    const result: GuestPaymentEntryDetail = {
      table: tableBase,
      session: sessionShape,
      identifiedGuest,
      mapping: {
        matchSource: guestMatch.matchSource,
        requiresSelection,
        message: mappingMessage,
        payMyShareDisabledReason: "The restaurant has not sent the live bill from the POS yet.",
        candidates: baseGuestCandidates
      },
      paymentSession: null
    };

    if (process.env.NODE_ENV !== "production") {
      result.debug = {
        joinedCustomer: {
          guestId: normLookup.guestId || null,
          guestName: normLookup.guestName || null,
          sessionId: normLookup.sessionId || null,
          sessionScoped: guestMatch.sessionScoped
        },
        sessionGuests: joinedGuests.map((g) => ({ guestId: g.id, displayName: g.displayName })),
        addAnotherGuestAvailable: true,
        detectedGuestCandidates: guestMatch.detectedGuestCandidates,
        finalMatchedGuestId: identifiedGuest?.id ?? null,
        matchedPaymentShareId: null
      };
    }

    return result;
  }

  const psShares = latestPs.shares;
  const myShare = resolveGuestPaymentShare(psShares, identifiedGuest);
  const fullBillShare = resolveFullBillShare(latestPs.splitMode, latestPs.totalAmount, psShares);

  const guestCandidates: GuestPaymentEntryGuestCandidate[] = joinedGuests.map((g) => {
    const share = resolveGuestPaymentShare(psShares, g);
    return {
      id: g.id,
      displayName: g.displayName,
      hasPaymentShare: Boolean(share),
      shareAmount: share ? share.amount.toString() : null,
      shareStatus: share?.status ?? null
    };
  });

  const invoiceLines: GuestPaymentEntryLine[] = latestPs.invoice.lines.map((line) => ({
    id: line.id,
    label: line.label,
    amount: line.amount.toString(),
    itemName: line.orderItem?.itemName ?? null,
    quantity: line.orderItem?.quantity ?? null,
    unitPrice: line.orderItem ? line.orderItem.unitPrice.toString() : null,
    guestId: line.guestId,
    guestName: line.guestId ? (joinedGuestMap.get(line.guestId)?.displayName ?? null) : null
  }));

  let mappingMessage: string | null = null;
  let payMyShareDisabledReason: string | null = null;

  if (!identifiedGuest) {
    mappingMessage =
      guestCandidates.length > 0
        ? "Select your name to map your own share."
        : "Join the table with your name first to pay your own share.";
    payMyShareDisabledReason =
      guestCandidates.length > 0
        ? "Select your name first to pay your own share."
        : "Join the table with your name first to pay your own share.";
  } else if (!myShare) {
    mappingMessage = `No active payment share found for ${identifiedGuest.displayName}. Ask staff to verify the split from the POS.`;
    payMyShareDisabledReason = "No payable share was found for the selected guest.";
  } else if (myShare.status === PaymentShareStatus.PAID) {
    mappingMessage = `Payment appears completed for ${identifiedGuest.displayName}.`;
    payMyShareDisabledReason = "This share was already paid.";
  } else if (visibleSession.status === SessionStatus.CLOSED) {
    mappingMessage = "This bill is already closed.";
    payMyShareDisabledReason = "This bill is already closed.";
  } else {
    mappingMessage = `Your live share for ${identifiedGuest.displayName} is ready.`;
  }

  const result: GuestPaymentEntryDetail = {
    table: tableBase,
    session: sessionShape,
    identifiedGuest,
    mapping: {
      matchSource: guestMatch.matchSource,
      requiresSelection: !identifiedGuest && guestCandidates.length > 0,
      message: mappingMessage,
      payMyShareDisabledReason,
      candidates: guestCandidates
    },
    paymentSession: {
      id: latestPs.id,
      splitMode: latestPs.splitMode,
      status: latestPs.status,
      totalAmount: latestPs.totalAmount.toString(),
      paidAmount: latestPs.paidAmount.toString(),
      remainingAmount: latestPs.remainingAmount.toString(),
      currency: latestPs.currency,
      fullBillOptionEnabled: Boolean(fullBillShare),
      myShare: myShare ? shareToEntryShare(myShare) : null,
      fullBillShare: fullBillShare ? shareToEntryShare(fullBillShare) : null,
      shares: psShares.map((s) => shareToEntryShare(s)),
      invoiceLines
    }
  };

  if (process.env.NODE_ENV !== "production") {
    result.debug = {
      joinedCustomer: {
        guestId: normLookup.guestId || null,
        guestName: normLookup.guestName || null,
        sessionId: normLookup.sessionId || null,
        sessionScoped: guestMatch.sessionScoped
      },
      sessionGuests: joinedGuests.map((g) => ({ guestId: g.id, displayName: g.displayName })),
      addAnotherGuestAvailable: true,
      detectedGuestCandidates: guestMatch.detectedGuestCandidates,
      finalMatchedGuestId: identifiedGuest?.id ?? null,
      matchedPaymentShareId: myShare?.id ?? null
    };
  }

  return result;
}

// ─── getMockPaymentLinkDetail ─────────────────────────────────────────────────

export async function getMockPaymentLinkDetail(paymentShareId: string, token: string) {
  const share = await prisma.paymentShare.findUnique({
    where: { id: paymentShareId },
    include: { guest: true }
  });

  if (!share) throw new Error("Payment link is invalid or expired.");

  if (
    share.provider !== ONLINE_PROVIDER ||
    !share.providerConversationId ||
    share.providerConversationId !== token
  ) {
    throw new Error("Payment link is invalid or expired.");
  }

  const ps = await prisma.paymentSession.findUniqueOrThrow({
    where: { id: share.paymentSessionId },
    include: paymentSessionFullInclude
  });

  const matchedShare = ps.shares.find((s) => s.id === share.id);
  if (!matchedShare) throw new Error("Payment share for this link was not found.");

  return { paymentSession: ps, paymentShare: matchedShare };
}

// ─── applyMockPaymentLinkAction ───────────────────────────────────────────────

export async function applyMockPaymentLinkAction(
  paymentShareId: string,
  token: string,
  action: MockPaymentLinkAction,
  tip = "0.00"
) {
  const { paymentShare } = await getMockPaymentLinkDetail(paymentShareId, token);

  if (action === "COMPLETE") {
    if (paymentShare.status !== PaymentShareStatus.PENDING) {
      throw new Error("Only pending payment links can be completed.");
    }
    return applyCashierPaymentShareAction(paymentShareId, "COMPLETE_PENDING_PAYMENT");
  }

  return applyCashierPaymentShareAction(paymentShareId, "MARK_PAYMENT_FAILED");
}
