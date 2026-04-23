import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { PaymentSessionStatus, PaymentShareStatus, PaymentStatus, SessionStatus, TableStatus } from "@prisma/client";

import { centsToDecimalString, toCents } from "@/lib/currency";
import { env } from "@/lib/env";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";
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

// ─── Prisma Types ────────────────────────────────────────────────────────────

type ShareRow = Prisma.PaymentShareGetPayload<{ include: { guest: true } }>;
type SessionRow = Prisma.PaymentSessionGetPayload<Record<string, never>>;
type TableSessionRow = Prisma.TableSessionGetPayload<Record<string, never>>;
type TableRow = Prisma.TableGetPayload<Record<string, never>>;
type BranchRow = Prisma.BranchGetPayload<Record<string, never>>;
type GuestRow = Prisma.GuestGetPayload<Record<string, never>>;

type IyzicoPaymentContext = {
  share: ShareRow;
  paymentSession: SessionRow;
  tableSession: TableSessionRow | null;
  table: TableRow | null;
  branch: BranchRow | null;
  guest: GuestRow | null;
};

// ─── Config ──────────────────────────────────────────────────────────────────

type IyzicoConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  callbackUrl: string;
  locale: "tr" | "en";
  currency: "TRY" | "USD" | "EUR" | "GBP";
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

// ─── Pure Helpers ────────────────────────────────────────────────────────────

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
  if (!value) return "0.00";
  const cents = toCents(value);
  if (cents < 0) throw new Error("Tip amount cannot be negative.");
  return centsToDecimalString(cents);
}

function splitBuyerName(value: string): { name: string; surname: string } {
  const parts = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { name: "Guest", surname: "Customer" };
  if (parts.length === 1) return { name: parts[0]!, surname: "Customer" };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1]! };
}

function safeEmailForShare(share: ShareRow): string {
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
  const baseShareCents = toCents(context.share.amount.toString());
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
    price: context.share.amount.toString(),
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
        price: context.share.amount.toString(),
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
  if (!raw.includes(".")) return raw;
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
  if (!response.signature) return null;
  const expected = responseSignature(config.secretKey, [response.conversationId, response.token]);
  return safeCompareHex(expected, response.signature.toLowerCase());
}

function validateRetrieveSignature(response: IyzicoRetrieveResponse, config: IyzicoConfig): boolean | null {
  if (!response.signature) return null;
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

  const expectedPaidPrice = centsToDecimalString(
    toCents(context.share.amount.toString()) + toCents(context.share.tip.toString())
  );

  if (response.price !== undefined && toCents(String(response.price)) !== toCents(context.share.amount.toString())) {
    throw new Error("iyzico base amount does not match this payment share.");
  }
  if (response.paidPrice !== undefined && toCents(String(response.paidPrice)) !== toCents(expectedPaidPrice)) {
    throw new Error("iyzico paid amount does not match this payment share.");
  }
}

function pendingCheckoutAgeMs(share: { updatedAt: Date }, nowMs = Date.now()): number {
  return Math.max(0, nowMs - share.updatedAt.getTime());
}

function isIyzicoPendingCheckout(share: ShareRow): boolean {
  return share.status === PaymentShareStatus.PENDING && share.provider === IYZICO_PROVIDER;
}

function isReusablePendingIyzicoCheckout(
  share: ShareRow,
  nowMs = Date.now()
): share is ShareRow & { paymentUrl: string } {
  return Boolean(
    isIyzicoPendingCheckout(share) &&
      share.paymentUrl &&
      pendingCheckoutAgeMs(share, nowMs) < IYZICO_PENDING_CHECKOUT_REUSE_MS
  );
}

function canInitializeIyzicoCheckout(share: ShareRow, nowMs = Date.now()): boolean {
  if (share.status === PaymentShareStatus.UNPAID || share.status === PaymentShareStatus.FAILED) {
    return true;
  }
  return isIyzicoPendingCheckout(share) && pendingCheckoutAgeMs(share, nowMs) >= IYZICO_PENDING_CHECKOUT_REUSE_MS;
}

function logIyzicoMetadata(event: string, metadata: JsonObject) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[iyzico]", event, metadata);
}

// ─── Settlement Sync ──────────────────────────────────────────────────────────

async function syncSettlementState(tx: Prisma.TransactionClient, paymentSessionId: string) {
  const ps = await tx.paymentSession.findUniqueOrThrow({ where: { id: paymentSessionId } });
  const shares = await tx.paymentShare.findMany({ where: { paymentSessionId } });

  const totalCents = toCents(ps.totalAmount.toString());
  const paidCents = shares
    .filter((s) => s.status === PaymentShareStatus.PAID)
    .reduce((sum, s) => sum + toCents(s.amount.toString()), 0);
  const remainingCents = Math.max(totalCents - paidCents, 0);

  let newStatus: PaymentSessionStatus = PaymentSessionStatus.OPEN;
  if (remainingCents === 0 && shares.length > 0) newStatus = PaymentSessionStatus.PAID;
  else if (paidCents > 0) newStatus = PaymentSessionStatus.PARTIALLY_PAID;

  const paidAmount = centsToDecimalString(paidCents);
  const remainingAmount = centsToDecimalString(remainingCents);

  if (
    ps.status !== newStatus ||
    toCents(ps.paidAmount.toString()) !== paidCents ||
    toCents(ps.remainingAmount.toString()) !== remainingCents
  ) {
    await tx.paymentSession.update({
      where: { id: paymentSessionId },
      data: {
        paidAmount,
        remainingAmount,
        status: newStatus
      }
    });
  }

  const tableSession = await tx.tableSession.findUnique({ where: { id: ps.sessionId } });

  if (tableSession) {
    const now = new Date();
    const sessionData: Prisma.TableSessionUpdateInput = {
      totalAmount: ps.totalAmount,
      paidAmount,
      remainingAmount
    };

    if (newStatus === PaymentSessionStatus.PAID) {
      sessionData.status = SessionStatus.CLOSED;
      sessionData.closedAt = tableSession.closedAt ?? now;
      sessionData.readyToCloseAt = tableSession.readyToCloseAt ?? now;
    } else if (tableSession.status === SessionStatus.OPEN) {
      sessionData.readyToCloseAt = null;
      sessionData.closedAt = null;
    }

    const shouldUpdateTableSession =
      toCents(tableSession.totalAmount.toString()) !== totalCents ||
      toCents(tableSession.paidAmount.toString()) !== paidCents ||
      toCents(tableSession.remainingAmount.toString()) !== remainingCents ||
      (newStatus === PaymentSessionStatus.PAID &&
        (tableSession.status !== SessionStatus.CLOSED || !tableSession.closedAt || !tableSession.readyToCloseAt)) ||
      (newStatus !== PaymentSessionStatus.PAID &&
        tableSession.status === SessionStatus.OPEN &&
        (Boolean(tableSession.closedAt) || Boolean(tableSession.readyToCloseAt)));

    if (shouldUpdateTableSession) {
      await tx.tableSession.update({ where: { id: ps.sessionId }, data: sessionData });
    }

    if (newStatus === PaymentSessionStatus.PAID) {
      const table = await tx.table.findUnique({
        where: { id: tableSession.tableId },
        select: { status: true }
      });

      if (table?.status !== TableStatus.AVAILABLE) {
        await tx.table.update({
          where: { id: tableSession.tableId },
          data: { status: TableStatus.AVAILABLE }
        });
      }
    }
  }
}

// ─── Prisma Context Loader ────────────────────────────────────────────────────

async function loadPaymentContext(
  tx: Prisma.TransactionClient,
  paymentShareId: string
): Promise<IyzicoPaymentContext> {
  const share = await tx.paymentShare.findUnique({
    where: { id: paymentShareId },
    include: { guest: true }
  });
  if (!share) throw new Error("Payment share not found.");

  const paymentSession = await tx.paymentSession.findUnique({ where: { id: share.paymentSessionId } });
  if (!paymentSession) throw new Error("Payment session not found.");

  const tableSession = await tx.tableSession.findUnique({ where: { id: paymentSession.sessionId } });
  const table = tableSession ? await tx.table.findUnique({ where: { id: tableSession.tableId } }) : null;
  const branch = tableSession ? await tx.branch.findUnique({ where: { id: tableSession.branchId } }) : null;
  const guest = share.guestId ? await tx.guest.findUnique({ where: { id: share.guestId } }) : null;

  return { share, paymentSession, tableSession, guest, table, branch };
}

async function loadPaymentContextRO(paymentShareId: string): Promise<IyzicoPaymentContext> {
  const share = await prisma.paymentShare.findUnique({
    where: { id: paymentShareId },
    include: { guest: true }
  });
  if (!share) throw new Error("Payment share not found.");

  const paymentSession = await prisma.paymentSession.findUnique({ where: { id: share.paymentSessionId } });
  if (!paymentSession) throw new Error("Payment session not found.");

  const tableSession = await prisma.tableSession.findUnique({ where: { id: paymentSession.sessionId } });
  const table = tableSession ? await prisma.table.findUnique({ where: { id: tableSession.tableId } }) : null;
  const branch = tableSession ? await prisma.branch.findUnique({ where: { id: tableSession.branchId } }) : null;
  const guest = share.guestId ? await prisma.guest.findUnique({ where: { id: share.guestId } }) : null;

  return { share, paymentSession, tableSession, guest, table, branch };
}

// ─── Token Search ─────────────────────────────────────────────────────────────

async function findShareByIyzicoToken(token: string): Promise<ShareRow | null> {
  const directShare = await prisma.paymentShare.findFirst({
    where: { provider: IYZICO_PROVIDER, providerPaymentId: token },
    include: { guest: true }
  });
  if (directShare) return directShare;

  type AttemptRow = { paymentShareId: string };
  const attempts = await prisma.$queryRaw<AttemptRow[]>`
    SELECT "paymentShareId" FROM "PaymentAttempt"
    WHERE provider = ${IYZICO_PROVIDER}
    AND (
      "requestPayload"::text LIKE ${"%" + token + "%"}
      OR "callbackPayload"::text LIKE ${"%" + token + "%"}
    )
    LIMIT 1
  `;

  const attemptShareId = attempts[0]?.paymentShareId ?? null;
  if (!attemptShareId) return null;

  return prisma.paymentShare.findUnique({
    where: { id: attemptShareId },
    include: { guest: true }
  });
}

function resultMessageForStatus(status: PaymentShareStatus, sessionStatus: PaymentSessionStatus): string {
  if (status === PaymentShareStatus.PAID) {
    return sessionStatus === PaymentSessionStatus.PAID ? "Odeme basarili. Hesap kapandi." : "Odeme basarili.";
  }
  if (status === PaymentShareStatus.PENDING) return "Odeme isleniyor.";
  return "Odeme basarisiz.";
}

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapIyzicoResultToInternalStatus(response: IyzicoRetrieveResponse): PaymentShareStatus {
  if (response.status !== "success") return PaymentShareStatus.FAILED;
  if (response.paymentStatus === "SUCCESS" && response.fraudStatus === 0) return PaymentShareStatus.PENDING;
  if (response.paymentStatus === "SUCCESS" && response.fraudStatus !== -1) return PaymentShareStatus.PAID;
  if (response.paymentStatus === "FAILURE" || response.fraudStatus === -1) return PaymentShareStatus.FAILED;
  return PaymentShareStatus.PENDING;
}

export async function initializeCheckoutFormForShare(
  paymentShareId: string,
  input: InitializeCheckoutInput = {}
) {
  const config = getIyzicoConfig();
  const normalizedTip = normalizeTipAmount(input.tip);
  const context = await loadPaymentContextRO(paymentShareId);
  const initializedAtMs = Date.now();

  if (context.paymentSession.status === PaymentSessionStatus.PAID || context.tableSession?.status === SessionStatus.CLOSED) {
    throw new Error("This payment session is already closed.");
  }

  if (context.share.status === PaymentShareStatus.PAID) {
    throw new Error("This share has already been paid.");
  }

  if (isReusablePendingIyzicoCheckout(context.share, initializedAtMs)) {
    return {
      message: "Odeme isleniyor.",
      paymentPageUrl: context.share.paymentUrl,
      paymentSession: context.paymentSession,
      paymentShare: context.share
    };
  }

  if (!canInitializeIyzicoCheckout(context.share, initializedAtMs)) {
    throw new Error("A payment is already in progress for this share.");
  }

  if (context.share.guestId && input.guestId && context.share.guestId !== input.guestId) {
    throw new Error("This payment share belongs to another guest.");
  }

  const conversationId = `iyzico_conv_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
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

  const resolvedUserId = input.userId ?? input.guestId ?? context.share.userId ?? context.share.guestId ?? null;

  await prisma.$transaction(async (tx) => {
    const { share, paymentSession, tableSession } = await loadPaymentContext(tx, paymentShareId);

    if (paymentSession.status === PaymentSessionStatus.PAID || tableSession?.status === SessionStatus.CLOSED) {
      throw new Error("This payment session is already closed.");
    }
    if (share.status === PaymentShareStatus.PAID) {
      throw new Error("This share has already been paid.");
    }
    if (!canInitializeIyzicoCheckout(share, initializedAtMs)) {
      throw new Error("A payment is already in progress for this share.");
    }

    await tx.paymentShare.update({
      where: { id: share.id },
      data: {
        userId: resolvedUserId,
        status: PaymentShareStatus.PENDING,
        tip: normalizedTip,
        provider: IYZICO_PROVIDER,
        providerPaymentId: null,
        providerConversationId: conversationId,
        paymentUrl: null,
        qrPayload: null,
        paidAt: null
      }
    });

    await tx.paymentAttempt.create({
      data: {
        paymentShare: { connect: { id: share.id } },
        provider: IYZICO_PROVIDER,
        status: "PENDING",
        requestPayload
      }
    });
  });

  try {
    const initializeResponse = await iyzicoPost<IyzicoInitializeResponse>(
      CHECKOUT_FORM_INITIALIZE_PATH,
      checkoutRequest,
      config
    );
    const signatureValid = validateInitializeSignature(initializeResponse, config);

    if (signatureValid === false) {
      throw new Error("iyzico initialize response signature validation failed.");
    }

    if (!initializeResponse.token || !initializeResponse.paymentPageUrl || initializeResponse.status !== "success") {
      throw new Error(initializeResponse.errorMessage || "iyzico checkout form could not be initialized.");
    }

    const callbackPayload = toJsonObject({
      initializeResponse: {
        status: initializeResponse.status,
        conversationId: initializeResponse.conversationId,
        token: initializeResponse.token,
        paymentPageUrlPresent: Boolean(initializeResponse.paymentPageUrl),
        signatureValid
      }
    });

    await prisma.$transaction(async (tx) => {
      await tx.paymentShare.update({
        where: { id: paymentShareId },
        data: {
          providerPaymentId: initializeResponse.token ?? null,
          paymentUrl: initializeResponse.paymentPageUrl ?? null,
          qrPayload: initializeResponse.paymentPageUrl ?? null
        }
      });

      const latestAttempt = await tx.paymentAttempt.findFirst({
        where: { paymentShareId, provider: IYZICO_PROVIDER },
        orderBy: { createdAt: "desc" }
      });

      if (latestAttempt) {
        await tx.paymentAttempt.update({
          where: { id: latestAttempt.id },
          data: { callbackPayload, status: "PENDING" }
        });
      }
    });

    const updatedShare = await prisma.paymentShare.findUniqueOrThrow({
      where: { id: paymentShareId },
      include: { guest: true }
    });
    const updatedPs = await prisma.paymentSession.findUniqueOrThrow({
      where: { id: context.paymentSession.id }
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
      paymentSession: updatedPs,
      paymentShare: updatedShare
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "iyzico checkout form initialization failed.";

    await prisma.$transaction(async (tx) => {
      const share = await tx.paymentShare.findUnique({ where: { id: paymentShareId } });

      if (share && share.status !== PaymentShareStatus.PAID) {
        await tx.paymentShare.update({
          where: { id: paymentShareId },
          data: {
            status: PaymentShareStatus.FAILED,
            provider: IYZICO_PROVIDER,
            providerConversationId: conversationId,
            paymentUrl: null,
            qrPayload: null,
            paidAt: null
          }
        });
      }

      const latestAttempt = await tx.paymentAttempt.findFirst({
        where: { paymentShareId, provider: IYZICO_PROVIDER },
        orderBy: { createdAt: "desc" }
      });

      if (latestAttempt) {
        await tx.paymentAttempt.update({
          where: { id: latestAttempt.id },
          data: {
            status: "FAILED",
            callbackPayload: toJsonObject({ initializeFailure: { conversationId, reason: failureReason } }),
            failureReason
          }
        });
      }
    });

    throw new Error("Kart odemesi baslatilamadi. Lutfen tekrar deneyin.");
  }
}

export async function verifyAndFinalizePayment(input: {
  token: string;
  callbackPayload?: JsonObject;
}) {
  const token = input.token.trim();
  if (!token) throw new Error("iyzico callback token is required.");

  const config = getIyzicoConfig();
  const initialShare = await findShareByIyzicoToken(token);
  if (!initialShare) throw new Error("iyzico payment share could not be matched.");

  const initialContext = await loadPaymentContextRO(initialShare.id);

  const retrieveRequest = {
    locale: config.locale,
    conversationId: initialShare.providerConversationId ?? undefined,
    token
  };
  const retrieveResponse = await iyzicoPost<IyzicoRetrieveResponse>(
    CHECKOUT_FORM_RETRIEVE_PATH,
    retrieveRequest,
    config
  );
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

  const result = await prisma.$transaction(async (tx) => {
    const share = await findShareByIyzicoToken(token);
    if (!share) throw new Error("iyzico payment share could not be matched.");

    const { paymentSession } = await loadPaymentContext(tx, share.id);
    const failureReason =
      retrieveResponse.errorMessage ?? (internalStatus === PaymentShareStatus.FAILED ? "iyzico payment failed." : null);

    if (share.status !== PaymentShareStatus.PAID) {
      await tx.paymentShare.update({
        where: { id: share.id },
        data: {
          status: internalStatus,
          provider: IYZICO_PROVIDER,
          providerPaymentId: retrieveResponse.paymentId ?? share.providerPaymentId ?? token,
          providerConversationId: retrieveResponse.conversationId ?? share.providerConversationId,
          paidAt: internalStatus === PaymentShareStatus.PAID ? new Date() : null,
          ...(internalStatus === PaymentShareStatus.FAILED || internalStatus === PaymentShareStatus.CANCELLED
            ? { paymentUrl: null, qrPayload: null }
            : {})
        }
      });
    }

    if (internalStatus === PaymentShareStatus.PAID && retrieveResponse.paymentId) {
      const existingPayment = await tx.payment.findUnique({
        where: { reference: retrieveResponse.paymentId }
      });

      if (!existingPayment) {
        await tx.payment.create({
          data: {
            invoiceId: paymentSession.invoiceId,
            guestId: share.guestId ?? undefined,
            amount: centsToDecimalString(
              toCents(share.amount.toString()) + toCents(share.tip.toString())
            ),
            currency: paymentSession.currency,
            method: IYZICO_PROVIDER,
            status: PaymentStatus.COMPLETED,
            reference: retrieveResponse.paymentId,
            paidAt: new Date()
          }
        });
      }
    }

    const latestAttempt = await tx.paymentAttempt.findFirst({
      where: { paymentShareId: share.id, provider: IYZICO_PROVIDER },
      orderBy: { createdAt: "desc" }
    });

    const attemptStatus: PaymentAttemptStatus =
      internalStatus === PaymentShareStatus.PAID
        ? "SUCCEEDED"
        : internalStatus === PaymentShareStatus.PENDING
          ? "PENDING"
          : "FAILED";

    if (latestAttempt) {
      await tx.paymentAttempt.update({
        where: { id: latestAttempt.id },
        data: { status: attemptStatus, callbackPayload, failureReason }
      });
    } else {
      await tx.paymentAttempt.create({
        data: {
          paymentShare: { connect: { id: share.id } },
          provider: IYZICO_PROVIDER,
          status: attemptStatus,
          requestPayload: toJsonObject({ action: "IYZICO_CALLBACK_WITHOUT_LOCAL_INITIALIZE" }),
          callbackPayload,
          failureReason
        }
      });
    }

    await syncSettlementState(tx, paymentSession.id);

    const updatedShare = await tx.paymentShare.findUniqueOrThrow({
      where: { id: share.id },
      include: { guest: true }
    });
    const updatedPs = await tx.paymentSession.findUniqueOrThrow({
      where: { id: paymentSession.id },
      include: {
        session: {
          include: {
            table: true
          }
        }
      }
    });

    return { paymentShare: updatedShare, paymentSession: updatedPs };
  });

  logIyzicoMetadata(
    "checkout_retrieved",
    toJsonObject({
      paymentShareId: result.paymentShare.id,
      providerPaymentId: retrieveResponse.paymentId ?? null,
      internalStatus,
      paymentStatus: retrieveResponse.paymentStatus ?? null,
      fraudStatus: retrieveResponse.fraudStatus ?? null,
      signatureValid
    })
  );

  return {
    message: resultMessageForStatus(result.paymentShare.status, result.paymentSession.status),
    paymentSession: result.paymentSession,
    paymentShare: result.paymentShare,
    retrievePayload: callbackPayload
  };
}

export async function handleIyzicoCallback(callbackPayload: JsonObject) {
  const token = typeof callbackPayload.token === "string" ? callbackPayload.token : "";
  return verifyAndFinalizePayment({ token, callbackPayload });
}

export async function getIyzicoPaymentResultForShare(paymentShareId: string) {
  const share = await prisma.paymentShare.findUnique({
    where: { id: paymentShareId },
    include: { guest: true }
  });
  if (!share) throw new Error("Payment share not found.");

  const paymentSession = await prisma.paymentSession.findUniqueOrThrow({
    where: { id: share.paymentSessionId },
    include: {
      session: {
        include: {
          table: true
        }
      }
    }
  });

  return { paymentShare: share, paymentSession };
}

export async function findIyzicoPaymentShareIdByToken(token: string): Promise<string | null> {
  const share = await findShareByIyzicoToken(token);
  return share?.id ?? null;
}
