import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";

import {
  applyCashierPaymentShareActionSchema,
  createPaymentSessionFromInvoiceSchema,
  generatePaymentSessionFromInvoiceSchema,
  paymentSessionRecordSchema,
  paymentShareRecordSchema
} from "@/features/payment/payment.schemas";
import {
  DEFAULT_PAYMENT_CURRENCY,
  type CashierPaymentShareAction,
  type CreatePaymentSessionFromInvoiceInput,
  type InvoicePaymentBundle
} from "@/features/payment/payment.types";
import { cloneValue, currentTimestamp, getSessionGuests, makeId, type LocalStoreData, updateStore } from "@/lib/local-store";

type GuestRecord = LocalStoreData["guests"][number];
type InvoiceRecord = LocalStoreData["invoices"][number];
type InvoiceAssignmentRecord = LocalStoreData["invoiceAssignments"][number];
type StoredPaymentSessionRecord = LocalStoreData["paymentSessions"][number];
type StoredPaymentShareRecord = LocalStoreData["paymentShares"][number];

type PaymentShareDetail = StoredPaymentShareRecord & {
  guest: GuestRecord | null;
};

type PaymentSessionDetail = StoredPaymentSessionRecord & {
  shares: PaymentShareDetail[];
};

type GeneratedPaymentSessionResult = {
  created: boolean;
  paymentSession: PaymentSessionDetail;
};

type ApplyCashierPaymentShareActionResult = {
  action: CashierPaymentShareAction;
  message: string;
  paymentSession: PaymentSessionDetail;
  paymentShare: PaymentShareDetail;
};

function formatFullPaymentLabel(tableName: string): string {
  const trimmed = tableName.trim();

  if (!trimmed) {
    return "Full payment";
  }

  if (/^table\b/i.test(trimmed)) {
    return `${trimmed} - Full payment`;
  }

  return `Table ${trimmed} - Full payment`;
}

function resolveGuestLabel(assignment: InvoiceAssignmentRecord, guestMap: Map<string, GuestRecord>): string {
  if (assignment.guestId) {
    return guestMap.get(assignment.guestId)?.displayName ?? assignment.payerLabel;
  }

  return assignment.payerLabel;
}

function hydratePaymentSessionDetail(
  store: LocalStoreData,
  paymentSession: StoredPaymentSessionRecord
): PaymentSessionDetail {
  const guestMap = new Map(getSessionGuests(store, paymentSession.sessionId).map((guest) => [guest.id, guest]));
  const shares = store.paymentShares
    .filter((share) => share.paymentSessionId === paymentSession.id)
    .map((share) => ({
      ...share,
      guest: share.guestId ? cloneValue(guestMap.get(share.guestId) ?? null) : null
    }));

  return cloneValue({
    ...paymentSession,
    shares
  });
}

function buildPaymentShareDrafts(
  store: LocalStoreData,
  invoice: InvoiceRecord
): CreatePaymentSessionFromInvoiceInput["shares"] {
  const session = store.sessions.find((entry) => entry.id === invoice.sessionId);

  if (!session) {
    throw new Error("Invoice session not found");
  }

  const table = store.tables.find((entry) => entry.id === session.tableId);
  const guestMap = new Map(getSessionGuests(store, session.id).map((guest) => [guest.id, guest]));
  const assignments = store.invoiceAssignments.filter((assignment) => assignment.invoiceId === invoice.id);

  if (invoice.splitMode === SplitMode.FULL_BY_ONE) {
    return [
      {
        guestId: null,
        payerLabel: formatFullPaymentLabel(table?.name ?? ""),
        amount: invoice.total
      }
    ];
  }

  if (assignments.length === 0) {
    throw new Error("Invoice has no split assignments to generate payment shares");
  }

  if (invoice.splitMode === SplitMode.EQUAL) {
    return assignments.map((assignment) => ({
      guestId: assignment.guestId,
      payerLabel: resolveGuestLabel(assignment, guestMap),
      amount: assignment.amount
    }));
  }

  if (invoice.splitMode === SplitMode.BY_GUEST_ITEMS) {
    return assignments.map((assignment) => ({
      guestId: assignment.guestId,
      payerLabel: resolveGuestLabel(assignment, guestMap),
      amount: assignment.amount
    }));
  }

  throw new Error("Unsupported split mode for payment session generation");
}

function derivePaymentSessionStatus(shares: StoredPaymentShareRecord[]): PaymentSessionStatus {
  if (shares.length === 0) {
    return PaymentSessionStatus.OPEN;
  }

  if (shares.every((share) => share.status === PaymentShareStatus.PAID)) {
    return PaymentSessionStatus.PAID;
  }

  if (shares.some((share) => share.status === PaymentShareStatus.PAID)) {
    return PaymentSessionStatus.PARTIALLY_PAID;
  }

  if (
    shares.every(
      (share) => share.status === PaymentShareStatus.FAILED || share.status === PaymentShareStatus.CANCELLED
    )
  ) {
    return PaymentSessionStatus.FAILED;
  }

  return PaymentSessionStatus.OPEN;
}

function applyMarkCashReceived(share: StoredPaymentShareRecord, now: string) {
  share.status = PaymentShareStatus.PAID;
  share.provider = "CASH_DESK";
  share.providerPaymentId = makeId("cash_payment");
  share.providerConversationId = null;
  share.paymentUrl = null;
  share.qrPayload = null;
  share.paidAt = now;
  share.updatedAt = now;
}

function applyMarkCardReceived(share: StoredPaymentShareRecord, now: string) {
  share.status = PaymentShareStatus.PAID;
  share.provider = "CARD_POS";
  share.providerPaymentId = makeId("card_payment");
  share.providerConversationId = null;
  share.paymentUrl = null;
  share.qrPayload = null;
  share.paidAt = now;
  share.updatedAt = now;
}

function applyCreateOnlinePaymentLink(share: StoredPaymentShareRecord, now: string) {
  const mockReference = makeId("online_ref");
  const paymentUrl = `https://odeme-restoran.example/pay/${share.id}?ref=${mockReference.slice(-8)}`;

  share.status = PaymentShareStatus.PENDING;
  share.provider = "MOCK_ONLINE_LINK";
  share.providerPaymentId = makeId("online_payment");
  share.providerConversationId = mockReference;
  share.paymentUrl = paymentUrl;
  share.qrPayload = paymentUrl;
  share.paidAt = null;
  share.updatedAt = now;
}

function runCashierPaymentShareAction(
  share: StoredPaymentShareRecord,
  action: CashierPaymentShareAction,
  now: string
): string {
  if (action === "MARK_CASH_RECEIVED") {
    if (share.status === PaymentShareStatus.PAID) {
      return "This share is already marked as paid.";
    }

    applyMarkCashReceived(share, now);
    return "Cash payment recorded.";
  }

  if (action === "MARK_CARD_RECEIVED") {
    if (share.status === PaymentShareStatus.PAID) {
      return "This share is already marked as paid.";
    }

    applyMarkCardReceived(share, now);
    return "Card payment recorded.";
  }

  if (action === "CREATE_ONLINE_PAYMENT_LINK") {
    if (share.status === PaymentShareStatus.PAID) {
      throw new Error("Cannot create an online payment link for a paid share.");
    }

    applyCreateOnlinePaymentLink(share, now);
    return "Mock online payment link created.";
  }

  throw new Error("Unsupported cashier payment action.");
}

export function buildPaymentBundleForInvoice(input: CreatePaymentSessionFromInvoiceInput): InvoicePaymentBundle {
  const parsed = createPaymentSessionFromInvoiceSchema.parse(input);
  const now = currentTimestamp();

  const paymentSession = paymentSessionRecordSchema.parse({
    id: makeId("payment_session"),
    sessionId: parsed.sessionId,
    invoiceId: parsed.invoiceId,
    splitMode: parsed.splitMode,
    totalAmount: parsed.totalAmount,
    currency: DEFAULT_PAYMENT_CURRENCY,
    status: PaymentSessionStatus.OPEN,
    createdAt: now,
    updatedAt: now
  });

  const paymentShares = parsed.shares.map((share) =>
    paymentShareRecordSchema.parse({
      id: makeId("payment_share"),
      paymentSessionId: paymentSession.id,
      guestId: share.guestId,
      payerLabel: share.payerLabel,
      amount: share.amount,
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

  return {
    paymentSession,
    paymentShares
  };
}

export async function createPaymentSessionFromInvoice(invoiceId: string): Promise<GeneratedPaymentSessionResult> {
  const parsed = generatePaymentSessionFromInvoiceSchema.parse({ invoiceId });

  return updateStore((store) => {
    const invoice = store.invoices.find((entry) => entry.id === parsed.invoiceId);

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const existingPaymentSession = store.paymentSessions.find((entry) => entry.invoiceId === invoice.id);

    if (existingPaymentSession) {
      return {
        created: false,
        paymentSession: hydratePaymentSessionDetail(store, existingPaymentSession)
      };
    }

    const { paymentSession, paymentShares } = buildPaymentBundleForInvoice({
      sessionId: invoice.sessionId,
      invoiceId: invoice.id,
      splitMode: invoice.splitMode,
      totalAmount: invoice.total,
      shares: buildPaymentShareDrafts(store, invoice)
    });

    store.paymentSessions.push(paymentSession);
    store.paymentShares.push(...paymentShares);

    return {
      created: true,
      paymentSession: hydratePaymentSessionDetail(store, paymentSession)
    };
  });
}

export async function applyCashierPaymentShareAction(
  paymentShareId: string,
  action: CashierPaymentShareAction
): Promise<ApplyCashierPaymentShareActionResult> {
  const parsed = applyCashierPaymentShareActionSchema.parse({ paymentShareId, action });

  return updateStore((store) => {
    const share = store.paymentShares.find((entry) => entry.id === parsed.paymentShareId);

    if (!share) {
      throw new Error("Payment share not found");
    }

    const paymentSession = store.paymentSessions.find((entry) => entry.id === share.paymentSessionId);

    if (!paymentSession) {
      throw new Error("Payment session not found");
    }

    const now = currentTimestamp();
    const message = runCashierPaymentShareAction(share, parsed.action, now);
    const sessionShares = store.paymentShares.filter((entry) => entry.paymentSessionId === paymentSession.id);

    paymentSession.status = derivePaymentSessionStatus(sessionShares);
    paymentSession.updatedAt = now;

    const hydratedPaymentSession = hydratePaymentSessionDetail(store, paymentSession);
    const hydratedShare = hydratedPaymentSession.shares.find((entry) => entry.id === share.id);

    if (!hydratedShare) {
      throw new Error("Updated payment share not found");
    }

    return {
      action: parsed.action,
      message,
      paymentSession: hydratedPaymentSession,
      paymentShare: cloneValue(hydratedShare)
    };
  });
}
