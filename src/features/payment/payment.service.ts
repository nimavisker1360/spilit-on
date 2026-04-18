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

type GuestPaymentEntryShare = {
  id: string;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  status: PaymentShareStatus;
  paymentUrl: string | null;
  provider: string | null;
};

type GuestPaymentEntryLine = {
  id: string;
  label: string;
  amount: string;
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

type GuestPaymentEntryMatchSource = "EXACT_GUEST_ID" | "NORMALIZED_NAME" | "CASE_INSENSITIVE_NORMALIZED_NAME" | "ALIAS" | null;

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
  sessionGuests: Array<{
    guestId: string;
    displayName: string;
  }>;
  addAnotherGuestAvailable: boolean;
  detectedGuestCandidates: Array<{
    guestId: string;
    displayName: string;
    strategy: Exclude<GuestPaymentEntryMatchSource, null>;
  }>;
  finalMatchedGuestId: string | null;
  matchedPaymentShareId: string | null;
};

type JoinedGuestSummary = {
  id: string;
  displayName: string;
};

export type GuestPaymentEntryDetail = {
  table: {
    id: string;
    name: string;
    code: string;
  };
  session: {
    id: string;
    openedAt: string;
    guests: Array<{
      id: string;
      displayName: string;
    }>;
  } | null;
  identifiedGuest: {
    id: string;
    displayName: string;
  } | null;
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

const CASH_PROVIDER = "CASH_DESK";
const CARD_PROVIDER = "CARD_POS";
const ONLINE_PROVIDER = "MOCK_ONLINE_LINK";
const MOCK_SETTLEMENT_PROVIDER = "MOCK_SETTLEMENT";

function formatFullPaymentLabel(tableName: string): string {
  const trimmed = tableName.trim();

  if (!trimmed) {
    return "Tum hesap";
  }

  if (/^table\b/i.test(trimmed) || /^masa\b/i.test(trimmed)) {
    return `${trimmed} - Tum hesap`;
  }

  return `Masa ${trimmed} - Tum hesap`;
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
    throw new Error("Odeme payi bulunamadi.");
  }

  const paymentSession = store.paymentSessions.find((entry) => entry.id === share.paymentSessionId);

  if (!paymentSession) {
    throw new Error("Odeme oturumu bulunamadi.");
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

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function toGuestPaymentEntryShare(share: PaymentShareDetail): GuestPaymentEntryShare {
  return {
    id: share.id,
    guestId: share.guestId,
    payerLabel: share.payerLabel,
    amount: share.amount,
    status: share.status,
    paymentUrl: share.paymentUrl,
    provider: share.provider
  };
}

function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldGuestName(value: string): string {
  return normalizeGuestName(value).toLocaleLowerCase("tr-TR");
}

function getSafeGuestAliases(guest: JoinedGuestSummary): string[] {
  const aliasKeys = ["alias", "paymentAlias", "shortName"];
  const guestRecord = guest as JoinedGuestSummary & Record<string, unknown>;
  const aliases = aliasKeys.flatMap((key) => {
    const value = guestRecord[key];
    return typeof value === "string" ? [normalizeGuestName(value), foldGuestName(value)] : [];
  });

  return Array.from(new Set(aliases.filter(Boolean)));
}

function resolveGuestMatch(
  joinedGuests: JoinedGuestSummary[],
  lookup: GuestPaymentLookupInput,
  activeSessionId: string
): {
  guest: JoinedGuestSummary | null;
  matchSource: GuestPaymentEntryMatchSource;
  detectedGuestCandidates: GuestPaymentEntryDebug["detectedGuestCandidates"];
  sessionScoped: boolean;
} {
  const normalizedLookupGuestId = lookup.guestId?.trim() ?? "";
  const normalizedLookupGuestName = normalizeGuestName(lookup.guestName ?? "");
  const foldedLookupGuestName = foldGuestName(lookup.guestName ?? "");
  const normalizedLookupSessionId = lookup.sessionId?.trim() ?? "";
  const detectedCandidates: GuestPaymentEntryDebug["detectedGuestCandidates"] = [];
  const detectedCandidateKeys = new Set<string>();
  const sessionScoped = !normalizedLookupSessionId || normalizedLookupSessionId === activeSessionId;

  function pushDetectedCandidates(
    strategy: Exclude<GuestPaymentEntryMatchSource, null>,
    guests: JoinedGuestSummary[]
  ): void {
    for (const guest of guests) {
      const candidateKey = `${strategy}:${guest.id}`;

      if (detectedCandidateKeys.has(candidateKey)) {
        continue;
      }

      detectedCandidateKeys.add(candidateKey);
      detectedCandidates.push({
        guestId: guest.id,
        displayName: guest.displayName,
        strategy
      });
    }
  }

  if (!sessionScoped) {
    return {
      guest: null,
      matchSource: null,
      detectedGuestCandidates: detectedCandidates,
      sessionScoped
    };
  }

  if (normalizedLookupGuestId) {
    const guest = joinedGuests.find((entry) => entry.id === normalizedLookupGuestId) ?? null;

    if (guest) {
      pushDetectedCandidates("EXACT_GUEST_ID", [guest]);
      return {
        guest,
        matchSource: "EXACT_GUEST_ID",
        detectedGuestCandidates: detectedCandidates,
        sessionScoped
      };
    }
  }

  if (normalizedLookupGuestName) {
    const normalizedNameMatches = joinedGuests.filter((guest) => normalizeGuestName(guest.displayName) === normalizedLookupGuestName);
    pushDetectedCandidates("NORMALIZED_NAME", normalizedNameMatches);

    if (normalizedNameMatches.length === 1) {
      return {
        guest: normalizedNameMatches[0],
        matchSource: "NORMALIZED_NAME",
        detectedGuestCandidates: detectedCandidates,
        sessionScoped
      };
    }
  }

  if (foldedLookupGuestName) {
    const foldedNameMatches = joinedGuests.filter((guest) => foldGuestName(guest.displayName) === foldedLookupGuestName);
    pushDetectedCandidates("CASE_INSENSITIVE_NORMALIZED_NAME", foldedNameMatches);

    if (foldedNameMatches.length === 1) {
      return {
        guest: foldedNameMatches[0],
        matchSource: "CASE_INSENSITIVE_NORMALIZED_NAME",
        detectedGuestCandidates: detectedCandidates,
        sessionScoped
      };
    }

    const aliasMatches = joinedGuests.filter((guest) => {
      const aliases = getSafeGuestAliases(guest);
      return aliases.includes(normalizedLookupGuestName) || aliases.includes(foldedLookupGuestName);
    });
    pushDetectedCandidates("ALIAS", aliasMatches);

    if (aliasMatches.length === 1) {
      return {
        guest: aliasMatches[0],
        matchSource: "ALIAS",
        detectedGuestCandidates: detectedCandidates,
        sessionScoped
      };
    }
  }

  return {
    guest: null,
    matchSource: null,
    detectedGuestCandidates: detectedCandidates,
    sessionScoped
  };
}

function paymentShareSelectionPriority(status: PaymentShareStatus): number {
  if (status === PaymentShareStatus.UNPAID) {
    return 0;
  }

  if (status === PaymentShareStatus.PENDING) {
    return 1;
  }

  if (status === PaymentShareStatus.PAID) {
    return 2;
  }

  if (status === PaymentShareStatus.FAILED) {
    return 3;
  }

  return 4;
}

function sortPaymentSharesForSelection(shares: PaymentShareDetail[]): PaymentShareDetail[] {
  return [...shares].sort((left, right) => {
    const priorityDifference = paymentShareSelectionPriority(left.status) - paymentShareSelectionPriority(right.status);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const updatedAtDifference = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();

    if (updatedAtDifference !== 0) {
      return updatedAtDifference;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function resolveGuestPaymentShare(paymentSession: PaymentSessionDetail, guest: JoinedGuestSummary | null): PaymentShareDetail | null {
  if (!guest) {
    return null;
  }

  const exactGuestShares = paymentSession.shares.filter((share) => share.guestId === guest.id);

  if (exactGuestShares.length > 0) {
    return sortPaymentSharesForSelection(exactGuestShares)[0] ?? null;
  }

  const normalizedGuestName = normalizeGuestName(guest.displayName);

  if (!normalizedGuestName) {
    return null;
  }

  const normalizedLabelMatches = paymentSession.shares.filter(
    (share) => !share.guestId && normalizeGuestName(share.payerLabel) === normalizedGuestName
  );

  if (normalizedLabelMatches.length === 1) {
    return sortPaymentSharesForSelection(normalizedLabelMatches)[0] ?? null;
  }

  const foldedGuestLabel = foldGuestName(guest.displayName);
  const foldedLabelMatches = paymentSession.shares.filter((share) => !share.guestId && foldGuestName(share.payerLabel) === foldedGuestLabel);

  if (foldedLabelMatches.length === 1) {
    return sortPaymentSharesForSelection(foldedLabelMatches)[0] ?? null;
  }

  return null;
}

function resolveFullBillShare(paymentSession: PaymentSessionDetail): PaymentShareDetail | null {
  if (paymentSession.shares.length === 0) {
    return null;
  }

  if (paymentSession.splitMode === SplitMode.FULL_BY_ONE) {
    return paymentSession.shares[0] ?? null;
  }

  const totalAmountCents = toCents(paymentSession.totalAmount);
  const exactTotalShare = paymentSession.shares.find((share) => toCents(share.amount) === totalAmountCents);

  return exactTotalShare ?? null;
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
    const fullPaymentAssignment = assignments[0] ?? null;

    return [
      {
        guestId: fullPaymentAssignment?.guestId ?? null,
        payerLabel: fullPaymentAssignment
          ? resolveGuestLabel(fullPaymentAssignment, guestMap)
          : formatFullPaymentLabel(table?.name ?? ""),
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
    throw new Error("Bu odeme payi zaten tahsil edilmis.");
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
    return "Nakit odemesi baslatildi. Odeme masasindan tamamlayin veya basarisiz isaretleyin.";
  }

  if (action === "PAY_BY_CARD") {
    return "Kart odemesi baslatildi. Odeme masasindan tamamlayin veya basarisiz isaretleyin.";
  }

  return "Online odeme linki hazir.";
}

function completePendingShare(store: LocalStoreData, share: StoredPaymentShareRecord, now: string): string {
  if (share.status !== PaymentShareStatus.PENDING) {
    throw new Error("Yalnizca bekleyen odeme paylari tamamlanabilir.");
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

  return share.provider === ONLINE_PROVIDER ? "Online odeme tamamlandi." : "Odeme tamamlandi ve tahsil edildi.";
}

function markShareFailed(store: LocalStoreData, share: StoredPaymentShareRecord, now: string): string {
  if (share.status === PaymentShareStatus.PAID) {
    throw new Error("Tahsil edilmis odeme paylari basarisiz olarak isaretlenemez.");
  }

  if (share.status === PaymentShareStatus.FAILED) {
    return "Bu odeme payi zaten basarisiz olarak isaretli.";
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
    failureReason: "Mock odeme akisinda basarisiz olarak isaretlendi.",
    timestamp: now
  });

  return previousStatus === PaymentShareStatus.PENDING
    ? "Bekleyen odeme basarisiz olarak isaretlendi."
    : "Odeme basarisiz olarak isaretlendi.";
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
              throw new Error("Desteklenmeyen kasiyer odeme aksiyonu.");
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
    throw new Error("Odeme linki gecersiz veya suresi dolmus.");
  }

  const hydratedPaymentSession = hydratePaymentSessionDetail(store, paymentSession);
  const hydratedShare = hydratedPaymentSession.shares.find((entry) => entry.id === share.id);

  if (!hydratedShare) {
    throw new Error("Bu link icin odeme payi bulunamadi.");
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
    currency: parsed.currency,
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

export async function getGuestPaymentEntry(
  tableCode: string,
  lookup: GuestPaymentLookupInput = {}
): Promise<GuestPaymentEntryDetail> {
  const normalizedTableCode = tableCode.trim();
  const normalizedLookup = {
    guestId: lookup.guestId?.trim() ?? "",
    guestName: lookup.guestName?.trim() ?? "",
    sessionId: lookup.sessionId?.trim() ?? ""
  };

  if (!normalizedTableCode) {
    throw new Error("Table code is required.");
  }

  const store = readStore();
  const table = store.tables.find((entry) => entry.code === normalizedTableCode);

  if (!table || table.status === "OUT_OF_SERVICE") {
    throw new Error("Table not found");
  }

  const activeSession = store.sessions.find((entry) => entry.tableId === table.id && entry.status === "OPEN") ?? null;

  if (!activeSession) {
    const debug =
      process.env.NODE_ENV !== "production"
        ? {
            joinedCustomer: {
              guestId: normalizedLookup.guestId || null,
              guestName: normalizedLookup.guestName || null,
              sessionId: normalizedLookup.sessionId || null,
              sessionScoped: false
            },
            sessionGuests: [],
            addAnotherGuestAvailable: false,
            detectedGuestCandidates: [],
            finalMatchedGuestId: null,
            matchedPaymentShareId: null
          }
        : undefined;

    return cloneValue({
      table: {
        id: table.id,
        name: table.name,
        code: table.code
      },
      session: null,
      identifiedGuest: null,
      mapping: {
        matchSource: null,
        requiresSelection: false,
        message: "Bu masada su an acik bir oturum yok. Personelden masayi acmasini isteyin.",
        payMyShareDisabledReason: "Acik masa oturumu olmadigi icin kendi payinizi secemezsiniz.",
        candidates: []
      },
      paymentSession: null,
      debug
    });
  }

  const joinedGuests = getSessionGuests(store, activeSession.id).map((guest) => ({
    id: guest.id,
    displayName: guest.displayName
  }));
  const joinedGuestMap = new Map(joinedGuests.map((guest) => [guest.id, guest]));
  const guestMatch = resolveGuestMatch(joinedGuests, normalizedLookup, activeSession.id);
  const identifiedGuest = guestMatch.guest ? cloneValue(guestMatch.guest) : null;
  const latestPaymentSession =
    sortByCreatedAtDesc(store.paymentSessions.filter((paymentSession) => paymentSession.sessionId === activeSession.id))[0] ?? null;

  const baseGuestCandidates = joinedGuests.map((guest) => ({
    id: guest.id,
    displayName: guest.displayName,
    hasPaymentShare: false,
    shareAmount: null,
    shareStatus: null
  }));

  if (!latestPaymentSession) {
    const requiresSelection = !identifiedGuest && joinedGuests.length > 0;
    const mappingMessage = identifiedGuest
      ? `${identifiedGuest.displayName} olarak eslestiniz. Hesap hazirlaninca payiniz burada gosterilecek.`
      : joinedGuests.length > 0
        ? "Kendi payinizi gormek icin adinizi secin. Hesap hazir oldugunda eslestirme korunur."
        : "Once masaya adinizla katilin. Hesap hazir oldugunda kendi payinizi gorebilirsiniz.";
    const debug =
      process.env.NODE_ENV !== "production"
        ? {
            joinedCustomer: {
              guestId: normalizedLookup.guestId || null,
              guestName: normalizedLookup.guestName || null,
              sessionId: normalizedLookup.sessionId || null,
              sessionScoped: guestMatch.sessionScoped
            },
            sessionGuests: joinedGuests.map((guest) => ({
              guestId: guest.id,
              displayName: guest.displayName
            })),
            addAnotherGuestAvailable: true,
            detectedGuestCandidates: guestMatch.detectedGuestCandidates,
            finalMatchedGuestId: identifiedGuest?.id ?? null,
            matchedPaymentShareId: null
          }
        : undefined;

    return cloneValue({
      table: {
        id: table.id,
        name: table.name,
        code: table.code
      },
      session: {
        id: activeSession.id,
        openedAt: activeSession.openedAt,
        guests: joinedGuests
      },
      identifiedGuest,
      mapping: {
        matchSource: guestMatch.matchSource,
        requiresSelection,
        message: mappingMessage,
        payMyShareDisabledReason: "Kasada odeme paylari henuz hazir degil.",
        candidates: baseGuestCandidates
      },
      paymentSession: null,
      debug
    });
  }

  const hydratedPaymentSession = hydratePaymentSessionDetail(store, latestPaymentSession);
  const myShare = resolveGuestPaymentShare(hydratedPaymentSession, identifiedGuest);
  const fullBillShare = resolveFullBillShare(hydratedPaymentSession);
  const guestCandidates = joinedGuests.map((guest) => {
    const share = resolveGuestPaymentShare(hydratedPaymentSession, guest);

    return {
      id: guest.id,
      displayName: guest.displayName,
      hasPaymentShare: Boolean(share),
      shareAmount: share?.amount ?? null,
      shareStatus: share?.status ?? null
    };
  });
  const invoiceLines = store.invoiceLines
    .filter((entry) => entry.invoiceId === hydratedPaymentSession.invoiceId)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      amount: entry.amount,
      guestId: entry.guestId,
      guestName: entry.guestId ? joinedGuestMap.get(entry.guestId)?.displayName ?? null : null
    }));
  const requiresSelection = !identifiedGuest && guestCandidates.length > 0;

  let mappingMessage: string | null = null;
  let payMyShareDisabledReason: string | null = null;

  if (!identifiedGuest) {
    mappingMessage =
      guestCandidates.length > 0
        ? "Adinizi secerek kendi payinizi eslestirin."
        : "Kendi payinizi odemek icin once masaya adinizla katilin.";
    payMyShareDisabledReason =
      guestCandidates.length > 0
        ? "Kendi payinizi odemek icin once adinizi secin."
        : "Kendi payinizi odemek icin once masaya adinizla katilin.";
  } else if (!myShare) {
    mappingMessage = `${identifiedGuest.displayName} icin aktif bir odeme payi bulunamadi. Kasadan kontrol isteyin.`;
    payMyShareDisabledReason = "Secilen kisi icin odenebilir bir pay bulunamadi.";
  } else if (myShare.status === PaymentShareStatus.PAID) {
    mappingMessage = `${identifiedGuest.displayName} icin odeme tamamlanmis gorunuyor.`;
    payMyShareDisabledReason = "Bu pay daha once odenmis.";
  } else {
    mappingMessage = `${identifiedGuest.displayName} icin payiniz hazir.`;
  }

  const debug =
    process.env.NODE_ENV !== "production"
      ? {
          joinedCustomer: {
            guestId: normalizedLookup.guestId || null,
            guestName: normalizedLookup.guestName || null,
            sessionId: normalizedLookup.sessionId || null,
            sessionScoped: guestMatch.sessionScoped
          },
          sessionGuests: joinedGuests.map((guest) => ({
            guestId: guest.id,
            displayName: guest.displayName
          })),
          addAnotherGuestAvailable: true,
          detectedGuestCandidates: guestMatch.detectedGuestCandidates,
          finalMatchedGuestId: identifiedGuest?.id ?? null,
          matchedPaymentShareId: myShare?.id ?? null
        }
      : undefined;

  return cloneValue({
    table: {
      id: table.id,
      name: table.name,
      code: table.code
    },
    session: {
      id: activeSession.id,
      openedAt: activeSession.openedAt,
      guests: joinedGuests
    },
    identifiedGuest,
    mapping: {
      matchSource: guestMatch.matchSource,
      requiresSelection,
      message: mappingMessage,
      payMyShareDisabledReason,
      candidates: guestCandidates
    },
    paymentSession: {
      id: hydratedPaymentSession.id,
      splitMode: hydratedPaymentSession.splitMode,
      status: hydratedPaymentSession.status,
      totalAmount: hydratedPaymentSession.totalAmount,
      paidAmount: hydratedPaymentSession.paidAmount,
      remainingAmount: hydratedPaymentSession.remainingAmount,
      currency: hydratedPaymentSession.currency,
      fullBillOptionEnabled: Boolean(fullBillShare),
      myShare: myShare ? toGuestPaymentEntryShare(myShare) : null,
      fullBillShare: fullBillShare ? toGuestPaymentEntryShare(fullBillShare) : null,
      shares: hydratedPaymentSession.shares.map((share) => toGuestPaymentEntryShare(share)),
      invoiceLines
    },
    debug
  });
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
        throw new Error("Yalnizca bekleyen odeme linkleri tamamlanabilir.");
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
