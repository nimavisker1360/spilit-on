import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";

import { centsToDecimalString, toCents } from "@/lib/currency";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { cloneValue, currentTimestamp, getSessionGuests, makeId, readStore, type LocalStoreData, updateStore } from "@/lib/local-store";
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
  type InvoicePaymentBundle,
  type PaymentAttemptStatus
} from "@/features/payment/payment.types";

type GuestRecord = LocalStoreData["guests"][number];
type TableRecord = LocalStoreData["tables"][number];
type TableSessionRecord = LocalStoreData["sessions"][number];
type InvoiceRecord = LocalStoreData["invoices"][number];
type InvoiceAssignmentRecord = LocalStoreData["invoiceAssignments"][number];
type StoredPaymentSessionRecord = LocalStoreData["paymentSessions"][number];
type StoredPaymentShareRecord = LocalStoreData["paymentShares"][number];

type PaymentShareDetail = StoredPaymentShareRecord & {
  guest: GuestRecord | null;
};

type PaymentSessionDetail = StoredPaymentSessionRecord & {
  shares: PaymentShareDetail[];
  session: {
    id: string;
    readyToCloseAt: string | null;
    table: Pick<TableRecord, "id" | "name" | "code"> | null;
  } | null;
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

type MockPaymentLinkAction = "COMPLETE" | "FAIL";

type MockPaymentLinkDetail = {
  paymentSession: PaymentSessionDetail;
  paymentShare: PaymentShareDetail;
};

type PaymentShareContext = {
  share: StoredPaymentShareRecord;
  paymentSession: StoredPaymentSessionRecord;
  tableSession: TableSessionRecord | null;
};

type SettlementState = {
  paidAmount: string;
  remainingAmount: string;
  status: PaymentSessionStatus;
};

const CASH_PROVIDER = "CASH_DESK";
const CARD_PROVIDER = "CARD_POS";
const ONLINE_PROVIDER = "MOCK_ONLINE_LINK";
const MOCK_SETTLEMENT_PROVIDER = "MOCK_SETTLEMENT";

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

function getPaymentShareContext(store: LocalStoreData, paymentShareId: string): PaymentShareContext {
  const share = store.paymentShares.find((entry) => entry.id === paymentShareId);

  if (!share) {
    throw new Error("Payment share not found");
  }

  const paymentSession = store.paymentSessions.find((entry) => entry.id === share.paymentSessionId);

  if (!paymentSession) {
    throw new Error("Payment session not found");
  }

  return {
    share,
    paymentSession,
    tableSession: store.sessions.find((entry) => entry.id === paymentSession.sessionId) ?? null
  };
}

function getPaymentSessionShares(store: LocalStoreData, paymentSessionId: string) {
  return store.paymentShares.filter((share) => share.paymentSessionId === paymentSessionId);
}

function calculateSettlementState(paymentSession: StoredPaymentSessionRecord, shares: StoredPaymentShareRecord[]): SettlementState {
  const totalCents = toCents(paymentSession.totalAmount);
  const paidCents = shares
    .filter((share) => share.status === PaymentShareStatus.PAID)
    .reduce((sum, share) => sum + toCents(share.amount), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);

  let status: PaymentSessionStatus = PaymentSessionStatus.OPEN;

  if (remainingCents === 0 && shares.length > 0) {
    status = PaymentSessionStatus.PAID;
  } else if (paidCents > 0) {
    status = PaymentSessionStatus.PARTIALLY_PAID;
  }

  return {
    paidAmount: centsToDecimalString(paidCents),
    remainingAmount: centsToDecimalString(remainingCents),
    status
  };
}

function synchronizeSettlementState(
  store: LocalStoreData,
  paymentSession: StoredPaymentSessionRecord,
  now: string
): StoredPaymentSessionRecord {
  const shares = getPaymentSessionShares(store, paymentSession.id);
  const settlementState = calculateSettlementState(paymentSession, shares);

  paymentSession.paidAmount = settlementState.paidAmount;
  paymentSession.remainingAmount = settlementState.remainingAmount;
  paymentSession.status = settlementState.status;
  paymentSession.updatedAt = now;

  const tableSession = store.sessions.find((entry) => entry.id === paymentSession.sessionId);

  if (tableSession) {
    tableSession.readyToCloseAt = settlementState.status === PaymentSessionStatus.PAID ? tableSession.readyToCloseAt ?? now : null;
  }

  return paymentSession;
}

function hydratePaymentSessionDetail(
  store: LocalStoreData,
  paymentSession: StoredPaymentSessionRecord
): PaymentSessionDetail {
  const guestMap = new Map(getSessionGuests(store, paymentSession.sessionId).map((guest) => [guest.id, guest]));
  const session = store.sessions.find((entry) => entry.id === paymentSession.sessionId) ?? null;
  const table = session ? store.tables.find((entry) => entry.id === session.tableId) ?? null : null;
  const shares = getPaymentSessionShares(store, paymentSession.id).map((share) => ({
    ...share,
    guest: share.guestId ? cloneValue(guestMap.get(share.guestId) ?? null) : null
  }));

  return cloneValue({
    ...paymentSession,
    shares,
    session: session
      ? {
          id: session.id,
          readyToCloseAt: session.readyToCloseAt,
          table: table
            ? {
                id: table.id,
                name: table.name,
                code: table.code
              }
            : null
        }
      : null
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

  if (invoice.splitMode === SplitMode.EQUAL || invoice.splitMode === SplitMode.BY_GUEST_ITEMS) {
    return assignments.map((assignment) => ({
      guestId: assignment.guestId,
      payerLabel: resolveGuestLabel(assignment, guestMap),
      amount: assignment.amount
    }));
  }

  throw new Error("Unsupported split mode for payment session generation");
}

function appendPaymentAttempt(
  store: LocalStoreData,
  input: {
    paymentShareId: string;
    provider: string;
    status: PaymentAttemptStatus;
    requestPayload: LocalStoreData["paymentAttempts"][number]["requestPayload"];
    callbackPayload?: LocalStoreData["paymentAttempts"][number]["callbackPayload"];
    failureReason?: string | null;
    timestamp: string;
  }
) {
  store.paymentAttempts.push({
    id: makeId("payment_attempt"),
    paymentShareId: input.paymentShareId,
    provider: input.provider,
    requestPayload: input.requestPayload,
    callbackPayload: input.callbackPayload ?? null,
    status: input.status,
    failureReason: input.failureReason ?? null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  });
}

function buildMockPaymentUrl(paymentShareId: string, token: string) {
  return `${getPublicAppBaseUrl()}/pay/${encodeURIComponent(paymentShareId)}?token=${encodeURIComponent(token)}`;
}

function initiatePendingShare(
  store: LocalStoreData,
  share: StoredPaymentShareRecord,
  action: Extract<CashierPaymentShareAction, "PAY_BY_CASH" | "PAY_BY_CARD" | "SEND_ONLINE_LINK">,
  now: string
): string {
  if (share.status === PaymentShareStatus.PAID) {
    throw new Error("This share is already paid.");
  }

  const provider = action === "PAY_BY_CASH" ? CASH_PROVIDER : action === "PAY_BY_CARD" ? CARD_PROVIDER : ONLINE_PROVIDER;
  const providerPaymentId =
    action === "PAY_BY_CASH"
      ? makeId("cash_payment")
      : action === "PAY_BY_CARD"
        ? makeId("card_payment")
        : makeId("online_payment");

  share.status = PaymentShareStatus.PENDING;
  share.provider = provider;
  share.providerPaymentId = providerPaymentId;
  share.paidAt = null;
  share.updatedAt = now;

  if (action === "SEND_ONLINE_LINK") {
    const accessToken = makeId("payment_link");
    const paymentUrl = buildMockPaymentUrl(share.id, accessToken);

    share.providerConversationId = accessToken;
    share.paymentUrl = paymentUrl;
    share.qrPayload = paymentUrl;
  } else {
    share.providerConversationId = null;
    share.paymentUrl = null;
    share.qrPayload = null;
  }

  appendPaymentAttempt(store, {
    paymentShareId: share.id,
    provider,
    status: "PENDING",
    requestPayload: {
      action,
      paymentShareStatus: share.status,
      amount: share.amount
    },
    timestamp: now
  });

  if (action === "PAY_BY_CASH") {
    return "Cash payment started. Complete or fail it from the settlement controls.";
  }

  if (action === "PAY_BY_CARD") {
    return "Card payment started. Complete or fail it from the settlement controls.";
  }

  return "Mock online payment link is ready to send.";
}

function completePendingShare(store: LocalStoreData, share: StoredPaymentShareRecord, now: string): string {
  if (share.status !== PaymentShareStatus.PENDING) {
    throw new Error("Only pending shares can be completed.");
  }

  share.status = PaymentShareStatus.PAID;
  share.paidAt = share.paidAt ?? now;
  share.updatedAt = now;

  appendPaymentAttempt(store, {
    paymentShareId: share.id,
    provider: share.provider ?? MOCK_SETTLEMENT_PROVIDER,
    status: "SUCCEEDED",
    requestPayload: {
      action: "COMPLETE_PENDING_PAYMENT",
      paymentShareStatus: "PENDING"
    },
    callbackPayload: {
      paymentShareStatus: share.status,
      paidAt: share.paidAt
    },
    timestamp: now
  });

  return share.provider === ONLINE_PROVIDER ? "Mock online payment completed." : "Payment completed and marked as paid.";
}

function markShareFailed(store: LocalStoreData, share: StoredPaymentShareRecord, now: string): string {
  if (share.status === PaymentShareStatus.PAID) {
    throw new Error("Paid shares cannot be marked as failed.");
  }

  if (share.status === PaymentShareStatus.FAILED) {
    return "This share is already marked as failed.";
  }

  const previousStatus = share.status;

  share.status = PaymentShareStatus.FAILED;
  share.paidAt = null;
  share.updatedAt = now;

  if (share.provider !== ONLINE_PROVIDER) {
    share.paymentUrl = null;
    share.qrPayload = null;
    share.providerConversationId = null;
  }

  appendPaymentAttempt(store, {
    paymentShareId: share.id,
    provider: share.provider ?? MOCK_SETTLEMENT_PROVIDER,
    status: "FAILED",
    requestPayload: {
      action: "MARK_PAYMENT_FAILED",
      paymentShareStatus: previousStatus
    },
    callbackPayload: {
      paymentShareStatus: share.status
    },
    failureReason: "Marked as failed in mock settlement flow.",
    timestamp: now
  });

  return previousStatus === PaymentShareStatus.PENDING ? "Pending payment marked as failed." : "Payment marked as failed.";
}

function applyPaymentShareActionInStore(
  store: LocalStoreData,
  paymentShareId: string,
  action: CashierPaymentShareAction,
  now: string
): ApplyCashierPaymentShareActionResult {
  const { share, paymentSession } = getPaymentShareContext(store, paymentShareId);

  const message =
    action === "PAY_BY_CASH" || action === "PAY_BY_CARD" || action === "SEND_ONLINE_LINK"
      ? initiatePendingShare(store, share, action, now)
      : action === "COMPLETE_PENDING_PAYMENT"
        ? completePendingShare(store, share, now)
        : action === "MARK_PAYMENT_FAILED"
          ? markShareFailed(store, share, now)
          : (() => {
              throw new Error("Unsupported cashier payment action.");
            })();

  const synchronizedSession = synchronizeSettlementState(store, paymentSession, now);
  const hydratedPaymentSession = hydratePaymentSessionDetail(store, synchronizedSession);
  const hydratedShare = hydratedPaymentSession.shares.find((entry) => entry.id === share.id);

  if (!hydratedShare) {
    throw new Error("Updated payment share not found");
  }

  return {
    action,
    message,
    paymentSession: hydratedPaymentSession,
    paymentShare: cloneValue(hydratedShare)
  };
}

function getValidatedMockPaymentLinkDetail(
  store: LocalStoreData,
  paymentShareId: string,
  token: string
): MockPaymentLinkDetail {
  const { share, paymentSession } = getPaymentShareContext(store, paymentShareId);

  if (share.provider !== ONLINE_PROVIDER || !share.providerConversationId || share.providerConversationId !== token) {
    throw new Error("Mock payment link is invalid or has expired.");
  }

  const hydratedPaymentSession = hydratePaymentSessionDetail(store, paymentSession);
  const hydratedShare = hydratedPaymentSession.shares.find((entry) => entry.id === share.id);

  if (!hydratedShare) {
    throw new Error("Payment share not found for this link.");
  }

  return {
    paymentSession: hydratedPaymentSession,
    paymentShare: hydratedShare
  };
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
    paidAmount: "0.00",
    remainingAmount: parsed.totalAmount,
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
      const now = currentTimestamp();
      const synchronizedSession = synchronizeSettlementState(store, existingPaymentSession, now);

      return {
        created: false,
        paymentSession: hydratePaymentSessionDetail(store, synchronizedSession)
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

  return updateStore((store) => applyPaymentShareActionInStore(store, parsed.paymentShareId, parsed.action, currentTimestamp()));
}

export async function getMockPaymentLinkDetail(paymentShareId: string, token: string): Promise<MockPaymentLinkDetail> {
  const store = readStore();
  return getValidatedMockPaymentLinkDetail(store, paymentShareId, token);
}

export async function applyMockPaymentLinkAction(
  paymentShareId: string,
  token: string,
  action: MockPaymentLinkAction
): Promise<MockPaymentLinkDetail> {
  return updateStore((store) => {
    const linkDetail = getValidatedMockPaymentLinkDetail(store, paymentShareId, token);

    if (action === "COMPLETE") {
      if (linkDetail.paymentShare.status !== PaymentShareStatus.PENDING) {
        throw new Error("Only pending mock links can be completed.");
      }

      const result = applyPaymentShareActionInStore(store, paymentShareId, "COMPLETE_PENDING_PAYMENT", currentTimestamp());
      return {
        paymentSession: result.paymentSession,
        paymentShare: result.paymentShare
      };
    }

    const result = applyPaymentShareActionInStore(store, paymentShareId, "MARK_PAYMENT_FAILED", currentTimestamp());

    return {
      paymentSession: result.paymentSession,
      paymentShare: result.paymentShare
    };
  });
}
