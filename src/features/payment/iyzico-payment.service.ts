import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { PaymentSessionStatus, PaymentShareStatus, PaymentStatus, SessionStatus, TableStatus } from "@prisma/client";

import { centsToDecimalString, toCents } from "@/lib/currency";
import { env } from "@/lib/env";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { cloneValue, currentTimestamp, getSessionGuests, makeId, readStore, type LocalStoreData, updateStore } from "@/lib/local-store";
import type { JsonObject, JsonValue, PaymentAttemptStatus } from "@/features/payment/payment.types";

export const IYZICO_PROVIDER = "iyzico";

const CHECKOUT_FORM_INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const CHECKOUT_FORM_RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const DEFAULT_IYZICO_BASE_URL = "https://sandbox-api.iyzipay.com";
const DEFAULT_BUYER_EMAIL_DOMAIN = "example.com";
const DEFAULT_BUYER_PHONE = "+905350000000";
const DEFAULT_IDENTITY_NUMBER = "11111111111";
const DEFAULT_ADDRESS = "Restaurant table payment";
const DEFAULT_CITY = "Istanbul";
const DEFAULT_COUNTRY = "Turkey";
const DEFAULT_ZIP_CODE = "34000";
const IYZICO_PENDING_CHECKOUT_REUSE_MS = 20 * 60 * 1000;

type StoredPaymentSessionRecord = LocalStoreData["paymentSessions"][number];
type StoredPaymentShareRecord = LocalStoreData["paymentShares"][number];
type StoredTableSessionRecord = LocalStoreData["sessions"][number];
type StoredTableRecord = LocalStoreData["tables"][number];
type StoredBranchRecord = LocalStoreData["branches"][number];
type StoredGuestRecord = LocalStoreData["guests"][number];
type StoredPaymentAttemptRecord = LocalStoreData["paymentAttempts"][number];

type PaymentShareDetail = StoredPaymentShareRecord & {
  guest: StoredGuestRecord | null;
};

type PaymentSessionDetail = StoredPaymentSessionRecord & {
  shares: PaymentShareDetail[];
  session: {
    id: string;
    status: SessionStatus;
    closedAt: string | null;
    readyToCloseAt: string | null;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    table: Pick<StoredTableRecord, "id" | "name" | "code"> | null;
  } | null;
};

type IyzicoConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  callbackUrl: string;
  locale: "tr" | "en";
  currency: "TRY" | "USD" | "EUR" | "GBP";
};

type IyzicoPaymentContext = {
  share: StoredPaymentShareRecord;
  paymentSession: StoredPaymentSessionRecord;
  tableSession: StoredTableSessionRecord | null;
  table: StoredTableRecord | null;
  branch: StoredBranchRecord | null;
  guest: StoredGuestRecord | null;
};

type InitializeCheckoutInput = {
  userId?: string | null;
  guestId?: string | null;
  tip?: string;
  buyerIp?: string | null;
};

type IyzicoCheckoutRequest = {
  locale: string;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  basketId: string;
  paymentGroup: string;
  callbackUrl: string;
  enabledInstallments: number[];
  buyer: {
    id: string;
    name: string;
    surname: string;
    identityNumber: string;
    email: string;
    gsmNumber: string;
    registrationAddress: string;
    city: string;
    country: string;
    zipCode: string;
    ip: string;
  };
  shippingAddress: {
    address: string;
    zipCode: string;
    contactName: string;
    city: string;
    country: string;
  };
  billingAddress: {
    address: string;
    zipCode: string;
    contactName: string;
    city: string;
    country: string;
  };
  basketItems: Array<{
    id: string;
    price: string;
    name: string;
    category1: string;
    category2: string;
    itemType: string;
  }>;
};

type IyzicoInitializeResponse = {
  status?: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  signature?: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
};

type IyzicoRetrieveResponse = {
  status?: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  price?: string | number;
  paidPrice?: string | number;
  installment?: number;
  paymentId?: string;
  fraudStatus?: number;
  basketId?: string;
  currency?: string;
  signature?: string;
  token?: string;
  callbackUrl?: string;
  paymentStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
  [key: string]: unknown;
};

type IyzicoCheckoutInitializeResult = {
  message: string;
  paymentPageUrl: string;
  paymentSession: PaymentSessionDetail;
  paymentShare: PaymentShareDetail;
};

type IyzicoFinalizeResult = {
  message: string;
  paymentSession: PaymentSessionDetail;
  paymentShare: PaymentShareDetail;
  retrievePayload: JsonValue;
};

type IyzicoPaymentResultDetail = {
  paymentSession: PaymentSessionDetail;
  paymentShare: PaymentShareDetail;
};

type SettlementState = {
  paidAmount: string;
  remainingAmount: string;
  status: PaymentSessionStatus;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function getIyzicoConfig(): IyzicoConfig {
  const apiKey = env.IYZICO_API_KEY?.trim() ?? "";
  const secretKey = env.IYZICO_SECRET_KEY?.trim() ?? "";

  if (!apiKey || !secretKey) {
    throw new Error("iyzico sandbox credentials are not configured.");
  }

  return {
    apiKey,
    secretKey,
    baseUrl: trimTrailingSlashes(env.IYZICO_BASE_URL || DEFAULT_IYZICO_BASE_URL),
    callbackUrl: env.IYZICO_CALLBACK_URL ?? `${getPublicAppBaseUrl()}/api/payments/iyzico/callback`,
    locale: env.IYZICO_LOCALE,
    currency: env.IYZICO_CURRENCY
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, toJsonValue(entry)])
    ) as JsonObject;
  }

  return null;
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return toJsonValue(value) as JsonObject;
}

function sanitizeIyzicoPayload(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeIyzicoPayload(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => entry !== undefined && key !== "binNumber" && key !== "lastFourDigits")
        .map(([key, entry]) => [key, sanitizeIyzicoPayload(entry)])
    ) as JsonObject;
  }

  return toJsonValue(value);
}

function normalizeTipAmount(value: string | undefined): string {
  if (!value) {
    return "0.00";
  }

  const cents = toCents(value);

  if (cents < 0) {
    throw new Error("Tip amount cannot be negative.");
  }

  return centsToDecimalString(cents);
}

function getPaymentSessionShares(store: LocalStoreData, paymentSessionId: string) {
  return store.paymentShares.filter((share) => share.paymentSessionId === paymentSessionId);
}

function getPaymentShareContext(store: LocalStoreData, paymentShareId: string): IyzicoPaymentContext {
  const share = store.paymentShares.find((entry) => entry.id === paymentShareId);

  if (!share) {
    throw new Error("Payment share not found.");
  }

  const paymentSession = store.paymentSessions.find((entry) => entry.id === share.paymentSessionId);

  if (!paymentSession) {
    throw new Error("Payment session not found.");
  }

  const tableSession = store.sessions.find((entry) => entry.id === paymentSession.sessionId) ?? null;
  const table = tableSession ? store.tables.find((entry) => entry.id === tableSession.tableId) ?? null : null;
  const branch = tableSession ? store.branches.find((entry) => entry.id === tableSession.branchId) ?? null : null;
  const guest = share.guestId ? store.guests.find((entry) => entry.id === share.guestId) ?? null : null;

  return {
    share,
    paymentSession,
    tableSession,
    table,
    branch,
    guest
  };
}

function calculateSettlementState(paymentSession: StoredPaymentSessionRecord, shares: StoredPaymentShareRecord[]): SettlementState {
  const totalCents = toCents(paymentSession.totalAmount);
  const paidCents = shares
    .filter((share) => share.status === PaymentShareStatus.PAID)
    .reduce((sum, share) => sum + toCents(share.amount), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);

  return {
    paidAmount: centsToDecimalString(paidCents),
    remainingAmount: centsToDecimalString(remainingCents),
    status: remainingCents === 0 && shares.length > 0 ? PaymentSessionStatus.PAID : paidCents > 0 ? PaymentSessionStatus.PARTIALLY_PAID : PaymentSessionStatus.OPEN
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
    tableSession.totalAmount = paymentSession.totalAmount;
    tableSession.paidAmount = settlementState.paidAmount;
    tableSession.remainingAmount = settlementState.remainingAmount;

    if (settlementState.status === PaymentSessionStatus.PAID) {
      tableSession.readyToCloseAt = tableSession.readyToCloseAt ?? now;
      tableSession.status = SessionStatus.CLOSED;
      tableSession.closedAt = tableSession.closedAt ?? now;

      const table = store.tables.find((entry) => entry.id === tableSession.tableId);

      if (table) {
        table.status = TableStatus.AVAILABLE;
        table.updatedAt = now;
      }
    } else if (tableSession.status === SessionStatus.OPEN) {
      tableSession.readyToCloseAt = null;
      tableSession.closedAt = null;
    }
  }

  return paymentSession;
}

function hydratePaymentSessionDetail(store: LocalStoreData, paymentSession: StoredPaymentSessionRecord): PaymentSessionDetail {
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
          status: session.status,
          closedAt: session.closedAt,
          readyToCloseAt: session.readyToCloseAt,
          totalAmount: session.totalAmount,
          paidAmount: session.paidAmount,
          remainingAmount: session.remainingAmount,
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

function hydrateShareResult(store: LocalStoreData, share: StoredPaymentShareRecord, paymentSession: StoredPaymentSessionRecord): IyzicoPaymentResultDetail {
  const hydratedPaymentSession = hydratePaymentSessionDetail(store, paymentSession);
  const hydratedShare = hydratedPaymentSession.shares.find((entry) => entry.id === share.id);

  if (!hydratedShare) {
    throw new Error("Updated payment share not found.");
  }

  return {
    paymentSession: hydratedPaymentSession,
    paymentShare: cloneValue(hydratedShare)
  };
}

function splitBuyerName(value: string): { name: string; surname: string } {
  const parts = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      name: "Guest",
      surname: "Customer"
    };
  }

  if (parts.length === 1) {
    return {
      name: parts[0],
      surname: "Customer"
    };
  }

  return {
    name: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1]
  };
}

function safeEmailForShare(share: StoredPaymentShareRecord): string {
  return `guest-${share.id.replace(/[^a-zA-Z0-9_-]/g, "")}@${DEFAULT_BUYER_EMAIL_DOMAIN}`;
}

function buildAddress(context: IyzicoPaymentContext) {
  const tableName = context.table?.name ? `Table ${context.table.name}` : "Restaurant table";
  const branchName = context.branch?.name ? `${context.branch.name}, ` : "";
  const address = `${branchName}${tableName}, ${context.branch?.location ?? DEFAULT_ADDRESS}`.slice(0, 500);
  const contactName = context.guest?.displayName ?? context.share.payerLabel;

  return {
    address,
    zipCode: DEFAULT_ZIP_CODE,
    contactName,
    city: DEFAULT_CITY,
    country: DEFAULT_COUNTRY
  };
}

function buildCheckoutRequest(
  context: IyzicoPaymentContext,
  config: IyzicoConfig,
  input: Required<Pick<InitializeCheckoutInput, "tip">> & Pick<InitializeCheckoutInput, "userId" | "guestId" | "buyerIp">,
  conversationId: string
): IyzicoCheckoutRequest {
  const baseShareCents = toCents(context.share.amount);
  const tipCents = toCents(input.tip);
  const paidPrice = centsToDecimalString(baseShareCents + tipCents);
  const buyerLabel = context.guest?.displayName ?? context.share.payerLabel;
  const buyerName = splitBuyerName(buyerLabel);
  const buyerId = input.userId ?? input.guestId ?? context.share.userId ?? context.share.guestId ?? context.share.id;
  const address = buildAddress(context);
  const basketName = `Restaurant share - ${context.share.payerLabel}`.slice(0, 255);

  return {
    locale: config.locale,
    conversationId,
    price: context.share.amount,
    paidPrice,
    currency: config.currency,
    basketId: context.paymentSession.id,
    paymentGroup: "PRODUCT",
    callbackUrl: config.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: buyerId,
      name: buyerName.name,
      surname: buyerName.surname,
      identityNumber: DEFAULT_IDENTITY_NUMBER,
      email: safeEmailForShare(context.share),
      gsmNumber: DEFAULT_BUYER_PHONE,
      registrationAddress: address.address,
      city: address.city,
      country: address.country,
      zipCode: address.zipCode,
      ip: input.buyerIp?.trim() || "127.0.0.1"
    },
    shippingAddress: address,
    billingAddress: address,
    basketItems: [
      {
        id: context.share.id,
        price: context.share.amount,
        name: basketName,
        category1: "Restaurant",
        category2: "Split payment",
        itemType: "VIRTUAL"
      }
    ]
  };
}

function sanitizeCheckoutRequestForStorage(request: IyzicoCheckoutRequest): JsonObject {
  return toJsonObject({
    locale: request.locale,
    conversationId: request.conversationId,
    price: request.price,
    paidPrice: request.paidPrice,
    currency: request.currency,
    basketId: request.basketId,
    paymentGroup: request.paymentGroup,
    callbackUrl: request.callbackUrl,
    buyer: {
      id: request.buyer.id,
      name: request.buyer.name,
      surname: request.buyer.surname,
      ipPresent: Boolean(request.buyer.ip)
    },
    basketItems: request.basketItems
  });
}

function buildAuthorizationHeader(config: IyzicoConfig, path: string, bodyText: string) {
  const randomKey = `${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const signaturePayload = `${randomKey}${path}${bodyText}`;
  const encryptedData = createHmac("sha256", config.secretKey).update(signaturePayload, "utf8").digest("hex");
  const authorizationString = `apiKey:${config.apiKey}&randomKey:${randomKey}&signature:${encryptedData}`;

  return {
    authorization: `IYZWSv2 ${Buffer.from(authorizationString, "utf8").toString("base64")}`,
    randomKey
  };
}

async function iyzicoPost<TResponse>(path: string, payload: Record<string, unknown>, config: IyzicoConfig): Promise<TResponse> {
  const bodyText = JSON.stringify(payload);
  const authorization = buildAuthorizationHeader(config, path, bodyText);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: authorization.authorization,
      "Content-Type": "application/json",
      "x-iyzi-rnd": authorization.randomKey
    },
    body: bodyText,
    cache: "no-store"
  });
  const responseText = await response.text();
  const parsed: TResponse & { errorMessage?: string } = responseText
    ? (JSON.parse(responseText) as TResponse & { errorMessage?: string })
    : ({} as TResponse & { errorMessage?: string });

  if (!response.ok) {
    throw new Error(parsed.errorMessage || `iyzico request failed with HTTP ${response.status}.`);
  }

  return parsed;
}

function normalizeSignatureAmount(value: unknown): string {
  const raw = String(value ?? "").trim();

  if (!raw.includes(".")) {
    return raw;
  }

  return raw.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function responseSignature(secretKey: string, values: Array<string | number | undefined | null>): string {
  const normalized = values.map((value) => String(value ?? ""));
  return createHmac("sha256", secretKey).update(normalized.join(":"), "utf8").digest("hex");
}

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateInitializeSignature(response: IyzicoInitializeResponse, config: IyzicoConfig): boolean | null {
  if (!response.signature) {
    return null;
  }

  const expected = responseSignature(config.secretKey, [response.conversationId, response.token]);
  return safeCompareHex(expected, response.signature.toLowerCase());
}

function validateRetrieveSignature(response: IyzicoRetrieveResponse, config: IyzicoConfig): boolean | null {
  if (!response.signature) {
    return null;
  }

  const expected = responseSignature(config.secretKey, [
    response.paymentStatus,
    response.paymentId,
    response.currency,
    response.basketId,
    response.conversationId,
    normalizeSignatureAmount(response.paidPrice),
    normalizeSignatureAmount(response.price),
    response.token
  ]);

  return safeCompareHex(expected, response.signature.toLowerCase());
}

function assertExpectedPaymentResult(
  response: IyzicoRetrieveResponse,
  context: IyzicoPaymentContext,
  token: string,
  config: IyzicoConfig
) {
  if (response.conversationId && context.share.providerConversationId && response.conversationId !== context.share.providerConversationId) {
    throw new Error("iyzico conversation id does not match this payment share.");
  }

  if (response.token && response.token !== token) {
    throw new Error("iyzico token does not match this payment share.");
  }

  if (response.basketId && response.basketId !== context.paymentSession.id) {
    throw new Error("iyzico basket id does not match this bill session.");
  }

  if (response.currency && response.currency !== config.currency) {
    throw new Error("iyzico currency does not match this payment share.");
  }

  const expectedPaidPrice = centsToDecimalString(toCents(context.share.amount) + toCents(context.share.tip));

  if (response.price !== undefined && toCents(String(response.price)) !== toCents(context.share.amount)) {
    throw new Error("iyzico base amount does not match this payment share.");
  }

  if (response.paidPrice !== undefined && toCents(String(response.paidPrice)) !== toCents(expectedPaidPrice)) {
    throw new Error("iyzico paid amount does not match this payment share.");
  }
}

function appendPaymentAttempt(
  store: LocalStoreData,
  input: {
    paymentShareId: string;
    provider: string;
    status: PaymentAttemptStatus;
    requestPayload: JsonValue;
    callbackPayload?: JsonValue | null;
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

function latestIyzicoAttempt(store: LocalStoreData, paymentShareId: string): StoredPaymentAttemptRecord | null {
  return (
    [...store.paymentAttempts]
      .filter((attempt) => attempt.paymentShareId === paymentShareId && attempt.provider === IYZICO_PROVIDER)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null
  );
}

function updateLatestIyzicoAttempt(
  store: LocalStoreData,
  paymentShareId: string,
  input: {
    status: PaymentAttemptStatus;
    callbackPayload?: JsonValue | null;
    failureReason?: string | null;
    timestamp: string;
  }
) {
  const attempt = latestIyzicoAttempt(store, paymentShareId);

  if (!attempt) {
    appendPaymentAttempt(store, {
      paymentShareId,
      provider: IYZICO_PROVIDER,
      status: input.status,
      requestPayload: toJsonObject({ action: "IYZICO_CALLBACK_WITHOUT_LOCAL_INITIALIZE" }),
      callbackPayload: input.callbackPayload ?? null,
      failureReason: input.failureReason ?? null,
      timestamp: input.timestamp
    });
    return;
  }

  attempt.status = input.status;
  attempt.callbackPayload = input.callbackPayload ?? attempt.callbackPayload;
  attempt.failureReason = input.failureReason ?? null;
  attempt.updatedAt = input.timestamp;
}

function appendCompletedPaymentIfMissing(
  store: LocalStoreData,
  input: {
    paymentSession: StoredPaymentSessionRecord;
    share: StoredPaymentShareRecord;
    amount: string;
    reference: string;
    timestamp: string;
  }
) {
  if (store.payments.some((payment) => payment.reference === input.reference)) {
    return;
  }

  store.payments.push({
    id: makeId("payment"),
    invoiceId: input.paymentSession.invoiceId,
    guestId: input.share.guestId,
    amount: input.amount,
    currency: input.paymentSession.currency,
    method: IYZICO_PROVIDER,
    status: PaymentStatus.COMPLETED,
    reference: input.reference,
    paidAt: input.timestamp,
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  });
}

function jsonContainsToken(value: JsonValue | null, token: string): boolean {
  if (value === token) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => jsonContainsToken(entry, token));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => jsonContainsToken(entry, token));
  }

  return false;
}

function findShareByIyzicoToken(store: LocalStoreData, token: string): StoredPaymentShareRecord | null {
  const directShare =
    store.paymentShares.find((share) => share.provider === IYZICO_PROVIDER && share.providerPaymentId === token) ?? null;

  if (directShare) {
    return directShare;
  }

  const attempt = store.paymentAttempts.find(
    (entry) =>
      entry.provider === IYZICO_PROVIDER &&
      (jsonContainsToken(entry.requestPayload, token) || jsonContainsToken(entry.callbackPayload, token))
  );

  if (!attempt) {
    return null;
  }

  return store.paymentShares.find((share) => share.id === attempt.paymentShareId) ?? null;
}

function resultMessageForStatus(status: PaymentShareStatus, paymentSession: PaymentSessionDetail): string {
  if (status === PaymentShareStatus.PAID) {
    return paymentSession.status === PaymentSessionStatus.PAID ? "Odeme basarili. Hesap kapandi." : "Odeme basarili.";
  }

  if (status === PaymentShareStatus.PENDING) {
    return "Odeme isleniyor.";
  }

  return "Odeme basarisiz.";
}

function pendingCheckoutAgeMs(share: StoredPaymentShareRecord, nowMs = Date.now()): number {
  const updatedAtMs = Date.parse(share.updatedAt);
  return Number.isFinite(updatedAtMs) ? Math.max(0, nowMs - updatedAtMs) : Number.POSITIVE_INFINITY;
}

function isIyzicoPendingCheckout(share: StoredPaymentShareRecord): boolean {
  return share.status === PaymentShareStatus.PENDING && share.provider === IYZICO_PROVIDER;
}

function isReusablePendingIyzicoCheckout(
  share: StoredPaymentShareRecord,
  nowMs = Date.now()
): share is StoredPaymentShareRecord & { paymentUrl: string } {
  return Boolean(isIyzicoPendingCheckout(share) && share.paymentUrl && pendingCheckoutAgeMs(share, nowMs) < IYZICO_PENDING_CHECKOUT_REUSE_MS);
}

function canInitializeIyzicoCheckout(share: StoredPaymentShareRecord, nowMs = Date.now()): boolean {
  if (share.status === PaymentShareStatus.UNPAID || share.status === PaymentShareStatus.FAILED) {
    return true;
  }

  return isIyzicoPendingCheckout(share) && pendingCheckoutAgeMs(share, nowMs) >= IYZICO_PENDING_CHECKOUT_REUSE_MS;
}

function logIyzicoMetadata(event: string, metadata: JsonObject) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[iyzico]", event, metadata);
}

export function mapIyzicoResultToInternalStatus(response: IyzicoRetrieveResponse): PaymentShareStatus {
  if (response.status !== "success") {
    return PaymentShareStatus.FAILED;
  }

  if (response.paymentStatus === "SUCCESS" && response.fraudStatus === 0) {
    return PaymentShareStatus.PENDING;
  }

  if (response.paymentStatus === "SUCCESS" && response.fraudStatus !== -1) {
    return PaymentShareStatus.PAID;
  }

  if (response.paymentStatus === "FAILURE" || response.fraudStatus === -1) {
    return PaymentShareStatus.FAILED;
  }

  return PaymentShareStatus.PENDING;
}

export async function initializeCheckoutFormForShare(
  paymentShareId: string,
  input: InitializeCheckoutInput = {}
): Promise<IyzicoCheckoutInitializeResult> {
  const config = getIyzicoConfig();
  const normalizedTip = normalizeTipAmount(input.tip);
  const store = readStore();
  const context = getPaymentShareContext(store, paymentShareId);
  const initializedAtMs = Date.now();

  if (context.paymentSession.status === PaymentSessionStatus.PAID || context.tableSession?.status === SessionStatus.CLOSED) {
    throw new Error("This payment session is already closed.");
  }

  if (context.share.status === PaymentShareStatus.PAID) {
    throw new Error("This share has already been paid.");
  }

  if (isReusablePendingIyzicoCheckout(context.share, initializedAtMs)) {
    const hydrated = hydrateShareResult(store, context.share, context.paymentSession);

    return {
      message: "Odeme isleniyor.",
      paymentPageUrl: context.share.paymentUrl,
      paymentSession: hydrated.paymentSession,
      paymentShare: hydrated.paymentShare
    };
  }

  if (!canInitializeIyzicoCheckout(context.share, initializedAtMs)) {
    throw new Error("A payment is already in progress for this share.");
  }

  if (context.share.guestId && input.guestId && context.share.guestId !== input.guestId) {
    throw new Error("This payment share belongs to another guest.");
  }

  const conversationId = makeId("iyzico_conv");
  const checkoutRequest = buildCheckoutRequest(
    context,
    config,
    {
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      buyerIp: input.buyerIp ?? null,
      tip: normalizedTip
    },
    conversationId
  );
  const requestPayload = toJsonObject({
    action: isIyzicoPendingCheckout(context.share) ? "IYZICO_CHECKOUT_FORM_REINITIALIZE" : "IYZICO_CHECKOUT_FORM_INITIALIZE",
    provider: IYZICO_PROVIDER,
    previousTokenReplaced: isIyzicoPendingCheckout(context.share),
    request: sanitizeCheckoutRequestForStorage(checkoutRequest)
  });
  const now = currentTimestamp();

  updateStore((draft) => {
    const { share, paymentSession, tableSession } = getPaymentShareContext(draft, paymentShareId);
    const resolvedUserId = input.userId ?? input.guestId ?? share.userId ?? share.guestId ?? null;

    if (paymentSession.status === PaymentSessionStatus.PAID || tableSession?.status === SessionStatus.CLOSED) {
      throw new Error("This payment session is already closed.");
    }

    if (share.status === PaymentShareStatus.PAID) {
      throw new Error("This share has already been paid.");
    }

    if (!canInitializeIyzicoCheckout(share, initializedAtMs)) {
      throw new Error("A payment is already in progress for this share.");
    }

    share.userId = resolvedUserId;
    share.status = PaymentShareStatus.PENDING;
    share.tip = normalizedTip;
    share.provider = IYZICO_PROVIDER;
    share.providerPaymentId = null;
    share.providerConversationId = conversationId;
    share.paymentUrl = null;
    share.qrPayload = null;
    share.paidAt = null;
    share.updatedAt = now;

    appendPaymentAttempt(draft, {
      paymentShareId,
      provider: IYZICO_PROVIDER,
      status: "PENDING",
      requestPayload,
      timestamp: now
    });
  });

  try {
    const initializeResponse = await iyzicoPost<IyzicoInitializeResponse>(CHECKOUT_FORM_INITIALIZE_PATH, checkoutRequest, config);
    const signatureValid = validateInitializeSignature(initializeResponse, config);

    if (signatureValid === false) {
      throw new Error("iyzico initialize response signature validation failed.");
    }

    if (initializeResponse.status !== "success" || !initializeResponse.token || !initializeResponse.paymentPageUrl) {
      throw new Error(initializeResponse.errorMessage || "iyzico checkout form could not be initialized.");
    }

    const updated = updateStore((draft) => {
      const { share, paymentSession } = getPaymentShareContext(draft, paymentShareId);
      const timestamp = currentTimestamp();

      share.status = PaymentShareStatus.PENDING;
      share.provider = IYZICO_PROVIDER;
      share.providerPaymentId = initializeResponse.token ?? null;
      share.providerConversationId = conversationId;
      share.paymentUrl = initializeResponse.paymentPageUrl ?? null;
      share.qrPayload = initializeResponse.paymentPageUrl ?? null;
      share.updatedAt = timestamp;

      updateLatestIyzicoAttempt(draft, paymentShareId, {
        status: "PENDING",
        callbackPayload: toJsonObject({
          initializeResponse: {
            status: initializeResponse.status,
            conversationId: initializeResponse.conversationId,
            token: initializeResponse.token,
            paymentPageUrlPresent: Boolean(initializeResponse.paymentPageUrl),
            signatureValid
          }
        }),
        timestamp
      });

      return hydrateShareResult(draft, share, paymentSession);
    });

    logIyzicoMetadata(
      "checkout_initialized",
      toJsonObject({
        paymentShareId,
        conversationId,
        tokenPresent: Boolean(initializeResponse.token),
        paymentPageUrlPresent: Boolean(initializeResponse.paymentPageUrl),
        signatureValid
      })
    );

    return {
      message: "Odeme isleniyor.",
      paymentPageUrl: initializeResponse.paymentPageUrl,
      paymentSession: updated.paymentSession,
      paymentShare: updated.paymentShare
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "iyzico checkout form initialization failed.";

    updateStore((draft) => {
      const { share } = getPaymentShareContext(draft, paymentShareId);
      const timestamp = currentTimestamp();

      if (share.status !== PaymentShareStatus.PAID) {
        share.status = PaymentShareStatus.FAILED;
        share.provider = IYZICO_PROVIDER;
        share.providerConversationId = conversationId;
        share.paymentUrl = null;
        share.qrPayload = null;
        share.paidAt = null;
        share.updatedAt = timestamp;
      }

      updateLatestIyzicoAttempt(draft, paymentShareId, {
        status: "FAILED",
        callbackPayload: toJsonObject({
          initializeFailure: {
            conversationId,
            reason: failureReason
          }
        }),
        failureReason,
        timestamp
      });
    });

    throw new Error("Kart odemesi baslatilamadi. Lutfen tekrar deneyin.");
  }
}

export async function verifyAndFinalizePayment(input: {
  token: string;
  callbackPayload?: JsonObject;
}): Promise<IyzicoFinalizeResult> {
  const token = input.token.trim();

  if (!token) {
    throw new Error("iyzico callback token is required.");
  }

  const config = getIyzicoConfig();
  const initialStore = readStore();
  const initialShare = findShareByIyzicoToken(initialStore, token);

  if (!initialShare) {
    throw new Error("iyzico payment share could not be matched.");
  }

  const initialContext = getPaymentShareContext(initialStore, initialShare.id);
  const retrieveRequest = {
    locale: config.locale,
    conversationId: initialShare.providerConversationId ?? undefined,
    token
  };
  const retrieveResponse = await iyzicoPost<IyzicoRetrieveResponse>(CHECKOUT_FORM_RETRIEVE_PATH, retrieveRequest, config);
  const signatureValid = validateRetrieveSignature(retrieveResponse, config);

  if (signatureValid === false) {
    throw new Error("iyzico retrieve response signature validation failed.");
  }

  assertExpectedPaymentResult(retrieveResponse, initialContext, token, config);

  const internalStatus = mapIyzicoResultToInternalStatus(retrieveResponse);
  const callbackPayload = toJsonObject({
    callback: input.callbackPayload ?? null,
    retrieveRequest: {
      locale: retrieveRequest.locale,
      conversationId: retrieveRequest.conversationId ?? null,
      token
    },
    retrieveResponse: sanitizeIyzicoPayload(retrieveResponse),
    signatureValid
  });
  const updated = updateStore((draft) => {
    const share = findShareByIyzicoToken(draft, token);

    if (!share) {
      throw new Error("iyzico payment share could not be matched.");
    }

    const { paymentSession } = getPaymentShareContext(draft, share.id);
    const timestamp = currentTimestamp();
    const failureReason = retrieveResponse.errorMessage ?? (internalStatus === PaymentShareStatus.FAILED ? "iyzico payment failed." : null);

    if (share.status !== PaymentShareStatus.PAID) {
      share.status = internalStatus;
      share.provider = IYZICO_PROVIDER;
      share.providerPaymentId = retrieveResponse.paymentId ?? share.providerPaymentId ?? token;
      share.providerConversationId = retrieveResponse.conversationId ?? share.providerConversationId;
      share.paidAt = internalStatus === PaymentShareStatus.PAID ? timestamp : null;
      share.updatedAt = timestamp;

      if (internalStatus === PaymentShareStatus.FAILED || internalStatus === PaymentShareStatus.CANCELLED) {
        share.paymentUrl = null;
        share.qrPayload = null;
      }
    }

    if (internalStatus === PaymentShareStatus.PAID && retrieveResponse.paymentId) {
      appendCompletedPaymentIfMissing(draft, {
        paymentSession,
        share,
        amount: centsToDecimalString(toCents(share.amount) + toCents(share.tip)),
        reference: retrieveResponse.paymentId,
        timestamp
      });
    }

    updateLatestIyzicoAttempt(draft, share.id, {
      status:
        internalStatus === PaymentShareStatus.PAID
          ? "SUCCEEDED"
          : internalStatus === PaymentShareStatus.PENDING
            ? "PENDING"
            : "FAILED",
      callbackPayload,
      failureReason,
      timestamp
    });

    const synchronizedPaymentSession = synchronizeSettlementState(draft, paymentSession, timestamp);
    return hydrateShareResult(draft, share, synchronizedPaymentSession);
  });

  logIyzicoMetadata(
    "checkout_retrieved",
    toJsonObject({
      paymentShareId: updated.paymentShare.id,
      providerPaymentId: retrieveResponse.paymentId ?? null,
      internalStatus,
      paymentStatus: retrieveResponse.paymentStatus ?? null,
      fraudStatus: retrieveResponse.fraudStatus ?? null,
      signatureValid
    })
  );

  return {
    message: resultMessageForStatus(updated.paymentShare.status, updated.paymentSession),
    paymentSession: updated.paymentSession,
    paymentShare: updated.paymentShare,
    retrievePayload: callbackPayload
  };
}

export async function handleIyzicoCallback(callbackPayload: JsonObject): Promise<IyzicoFinalizeResult> {
  const token = typeof callbackPayload.token === "string" ? callbackPayload.token : "";
  return verifyAndFinalizePayment({
    token,
    callbackPayload
  });
}

export async function getIyzicoPaymentResultForShare(paymentShareId: string): Promise<IyzicoPaymentResultDetail> {
  const store = readStore();
  const { share, paymentSession } = getPaymentShareContext(store, paymentShareId);
  return hydrateShareResult(store, share, paymentSession);
}

export async function findIyzicoPaymentShareIdByToken(token: string): Promise<string | null> {
  const store = readStore();
  return findShareByIyzicoToken(store, token)?.id ?? null;
}
