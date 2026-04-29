import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { type Prisma, InvoiceStatus, PaymentMethodType, PlatformPaymentStatus, SubscriptionStatus, TenantStatus, WorkspaceMode } from "@prisma/client";

import { PRO_PLAN_CODE } from "@/features/billing/plan-config";
import type { JsonObject, JsonValue } from "@/features/payment/payment.types";
import { centsToDecimalString, toCents } from "@/lib/currency";
import { env } from "@/lib/env";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";

const IYZICO_PROVIDER = "iyzico";
const CHECKOUT_FORM_INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const CHECKOUT_FORM_RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const DEFAULT_IYZICO_BASE_URL = "https://sandbox-api.iyzipay.com";
const DEFAULT_EMAIL_DOMAIN = "example.com";
const DEFAULT_PHONE = "+905350000000";
const DEFAULT_IDENTITY_NUMBER = "11111111111";
const DEFAULT_ADDRESS = "Restaurant billing";
const DEFAULT_CITY = "Istanbul";
const DEFAULT_COUNTRY = "Turkey";
const DEFAULT_ZIP_CODE = "34000";

type BillingActivationContext = {
  restaurant: {
    id: string;
    name: string;
    legalName: string | null;
    billingEmail: string | null;
    phone: string | null;
    currentPlanId: string | null;
    status: TenantStatus;
    workspaceMode: WorkspaceMode;
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
  };
  plan: {
    id: string;
    code: string;
    name: string;
    monthlyPrice: Prisma.Decimal;
    currency: string;
  };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    billingPeriod: "MONTHLY" | "ANNUAL";
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  } | null;
};

type BillingCheckoutRequest = {
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

type IyzicoConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  callbackUrl: string;
  locale: "tr" | "en";
  currency: "TRY" | "USD" | "EUR" | "GBP";
};

type IyzicoInitializeResponse = {
  status?: string;
  conversationId?: string;
  token?: string;
  paymentPageUrl?: string;
  signature?: string;
  errorCode?: string;
  errorMessage?: string;
};

type IyzicoRetrieveResponse = {
  status?: string;
  conversationId?: string;
  price?: string | number;
  paidPrice?: string | number;
  paymentId?: string;
  fraudStatus?: number;
  basketId?: string;
  currency?: string;
  signature?: string;
  token?: string;
  paymentStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
  [key: string]: unknown;
};

type BillingPaymentWithActivation = Prisma.PlatformPaymentGetPayload<{
  include: {
    invoice: true;
    subscription: {
      include: {
        plan: true;
        restaurant: {
          select: {
            id: true;
            currentPlanId: true;
            status: true;
            workspaceMode: true;
          };
        };
      };
    };
  };
}>;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function getIyzicoBillingConfig(): IyzicoConfig {
  const apiKey = env.IYZICO_API_KEY?.trim() ?? "";
  const secretKey = env.IYZICO_SECRET_KEY?.trim() ?? "";

  if (!apiKey || !secretKey) {
    throw new Error("iyzico sandbox credentials are not configured.");
  }

  return {
    apiKey,
    secretKey,
    baseUrl: trimTrailingSlashes(env.IYZICO_BASE_URL || DEFAULT_IYZICO_BASE_URL),
    callbackUrl:
      env.IYZICO_BILLING_CALLBACK_URL ?? `${getPublicAppBaseUrl()}/api/payments/iyzico/billing/callback`,
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

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function responseSignature(secretKey: string, values: Array<string | number | undefined | null>): string {
  const normalized = values.map((value) => String(value ?? ""));
  return createHmac("sha256", secretKey).update(normalized.join(":"), "utf8").digest("hex");
}

function normalizeSignatureAmount(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw.includes(".")) return raw;
  return raw.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
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

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function splitBuyerName(value: string): { name: string; surname: string } {
  const parts = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { name: "Restaurant", surname: "Owner" };
  if (parts.length === 1) return { name: parts[0]!, surname: "Owner" };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1]! };
}

function safeRestaurantEmail(restaurant: BillingActivationContext["restaurant"]): string {
  if (restaurant.billingEmail?.trim()) {
    return restaurant.billingEmail.trim();
  }

  return `billing-${restaurant.id.replace(/[^a-zA-Z0-9_-]/g, "")}@${DEFAULT_EMAIL_DOMAIN}`;
}

function safeRestaurantPhone(restaurant: BillingActivationContext["restaurant"]): string {
  return restaurant.phone?.trim() || DEFAULT_PHONE;
}

function invoiceNumber(now = new Date()): string {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `PRO-${stamp}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function paymentFailureMessage(errorMessage?: string): string {
  return errorMessage?.trim() || "Pro payment could not be completed.";
}

function stringFromCallbackPayload(payload: JsonObject | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function conversationIdFromPayment(payment: { metadata: Prisma.JsonValue }): string | null {
  const metadata =
    payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};

  return typeof metadata.conversationId === "string" && metadata.conversationId.trim()
    ? metadata.conversationId.trim()
    : null;
}

async function findBillingPaymentForCallback(input: {
  token?: string | null;
  callbackPayload?: JsonObject;
}): Promise<BillingPaymentWithActivation | null> {
  const token = input.token?.trim() || null;
  const basketId = stringFromCallbackPayload(input.callbackPayload, "basketId");
  const paymentId = stringFromCallbackPayload(input.callbackPayload, "paymentId");
  const conversationId = stringFromCallbackPayload(input.callbackPayload, "conversationId");
  const include = {
    invoice: true,
    subscription: {
      include: {
        plan: true,
        restaurant: {
          select: {
            id: true,
            currentPlanId: true,
            status: true,
            workspaceMode: true
          }
        }
      }
    }
  } satisfies Prisma.PlatformPaymentInclude;

  if (token) {
    const payment = await prisma.platformPayment.findFirst({
      where: { provider: IYZICO_PROVIDER, providerPaymentId: token },
      include
    });

    if (payment) return payment;
  }

  if (basketId) {
    const payment = await prisma.platformPayment.findFirst({
      where: { id: basketId, provider: IYZICO_PROVIDER },
      include
    });

    if (payment) return payment;
  }

  if (paymentId) {
    const payment = await prisma.platformPayment.findFirst({
      where: { provider: IYZICO_PROVIDER, providerTransactionId: paymentId },
      include
    });

    if (payment) return payment;
  }

  if (conversationId) {
    return prisma.platformPayment.findFirst({
      where: {
        provider: IYZICO_PROVIDER,
        metadata: {
          path: ["conversationId"],
          equals: conversationId
        }
      },
      include
    });
  }

  return null;
}

function isPaymentActivationComplete(payment: BillingPaymentWithActivation): boolean {
  return (
    payment.status === PlatformPaymentStatus.SUCCEEDED &&
    payment.subscription.status === SubscriptionStatus.ACTIVE &&
    payment.subscription.restaurant.currentPlanId === payment.subscription.planId &&
    payment.subscription.restaurant.status === TenantStatus.ACTIVE &&
    payment.subscription.restaurant.workspaceMode === WorkspaceMode.LIVE
  );
}

function buildBillingCheckoutRequest(input: {
  paymentId: string;
  paymentAmount: string;
  buyerIp: string | null;
  conversationId: string;
  context: BillingActivationContext;
  config: IyzicoConfig;
}): BillingCheckoutRequest {
  const buyerLabel = input.context.restaurant.legalName?.trim() || input.context.restaurant.name;
  const buyerName = splitBuyerName(buyerLabel);
  const address = {
    address: DEFAULT_ADDRESS,
    zipCode: DEFAULT_ZIP_CODE,
    contactName: buyerLabel,
    city: DEFAULT_CITY,
    country: DEFAULT_COUNTRY
  };

  return {
    locale: input.config.locale,
    conversationId: input.conversationId,
    price: input.paymentAmount,
    paidPrice: input.paymentAmount,
    currency: input.context.plan.currency || input.config.currency,
    basketId: input.paymentId,
    paymentGroup: "SUBSCRIPTION",
    callbackUrl: input.config.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: input.context.restaurant.id,
      name: buyerName.name,
      surname: buyerName.surname,
      identityNumber: DEFAULT_IDENTITY_NUMBER,
      email: safeRestaurantEmail(input.context.restaurant),
      gsmNumber: safeRestaurantPhone(input.context.restaurant),
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
        id: input.context.plan.id,
        price: input.paymentAmount,
        name: `${input.context.plan.name} monthly plan`,
        category1: "SaaS",
        category2: "Subscription",
        itemType: "VIRTUAL"
      }
    ]
  };
}

function getBuyerIp(requestMeta?: { buyerIp?: string | null }): string | null {
  return requestMeta?.buyerIp?.trim() || null;
}

async function getBillingActivationContext(restaurantId: string): Promise<BillingActivationContext> {
  const [restaurant, plan, subscription] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        legalName: true,
        billingEmail: true,
        phone: true,
        currentPlanId: true,
        status: true,
        workspaceMode: true,
        trialStartedAt: true,
        trialEndsAt: true
      }
    }),
    prisma.subscriptionPlan.findFirst({
      where: { code: PRO_PLAN_CODE, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        monthlyPrice: true,
        currency: true
      }
    }),
    prisma.tenantSubscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        billingPeriod: true,
        currentPeriodStart: true,
        currentPeriodEnd: true
      }
    })
  ]);

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  if (!plan) {
    throw new Error("Active Pro plan configuration was not found.");
  }

  return { restaurant, plan, subscription };
}

async function getOrCreateLatestSubscription(
  tx: Prisma.TransactionClient,
  context: BillingActivationContext
) {
  const latestSubscription = await tx.tenantSubscription.findFirst({
    where: { restaurantId: context.restaurant.id },
    orderBy: { createdAt: "desc" }
  });

  if (latestSubscription) {
    return latestSubscription;
  }

  const now = new Date();
  const currentPeriodEnd = addMonths(now, 1);

  return tx.tenantSubscription.create({
    data: {
      restaurantId: context.restaurant.id,
      planId: context.plan.id,
      provider: IYZICO_PROVIDER,
      status: SubscriptionStatus.CANCELLED,
      billingPeriod: "MONTHLY",
      currentPeriodStart: now,
      currentPeriodEnd,
      autoRenew: true,
      cancelAtPeriodEnd: false
    }
  });
}

function isAlreadyActive(context: BillingActivationContext): boolean {
  return (
    context.subscription?.status === SubscriptionStatus.ACTIVE &&
    context.restaurant.currentPlanId === context.plan.id &&
    context.restaurant.status === TenantStatus.ACTIVE &&
    context.restaurant.workspaceMode === WorkspaceMode.LIVE
  );
}

function mapBillingResultStatus(response: IyzicoRetrieveResponse): PlatformPaymentStatus {
  if (response.status !== "success") return PlatformPaymentStatus.FAILED;
  if (response.paymentStatus === "SUCCESS" && response.fraudStatus !== -1) return PlatformPaymentStatus.SUCCEEDED;
  if (response.paymentStatus === "FAILURE" || response.fraudStatus === -1) return PlatformPaymentStatus.FAILED;
  return PlatformPaymentStatus.PENDING;
}

function assertExpectedBillingResult(params: {
  response: IyzicoRetrieveResponse;
  payment: {
    id: string;
    amount: Prisma.Decimal;
    currency: string;
    providerPaymentId: string | null;
    metadata: Prisma.JsonValue;
  };
  token: string;
  config: IyzicoConfig;
}) {
  const expectedAmount = centsToDecimalString(toCents(params.payment.amount.toString()));
  const metadata =
    params.payment.metadata && typeof params.payment.metadata === "object" && !Array.isArray(params.payment.metadata)
      ? (params.payment.metadata as Record<string, unknown>)
      : {};
  const storedConversationId = typeof metadata.conversationId === "string" ? metadata.conversationId : null;

  if (params.response.token && params.response.token !== params.token) {
    throw new Error("iyzico token does not match this billing payment.");
  }

  if (params.response.basketId && params.response.basketId !== params.payment.id) {
    throw new Error("iyzico basket id does not match this billing payment.");
  }

  if (params.response.currency && params.response.currency !== params.payment.currency) {
    throw new Error("iyzico currency does not match this billing payment.");
  }

  if (params.response.price !== undefined && toCents(String(params.response.price)) !== toCents(expectedAmount)) {
    throw new Error("iyzico base amount does not match this billing payment.");
  }

  if (params.response.paidPrice !== undefined && toCents(String(params.response.paidPrice)) !== toCents(expectedAmount)) {
    throw new Error("iyzico paid amount does not match this billing payment.");
  }

  if (params.response.conversationId && storedConversationId && params.response.conversationId !== storedConversationId) {
    throw new Error("iyzico conversation id does not match this billing payment.");
  }
}

export async function initializeProPlanActivation(input: {
  restaurantId: string;
  buyerIp?: string | null;
}) {
  const context = await getBillingActivationContext(input.restaurantId);

  if (isAlreadyActive(context)) {
    return {
      alreadyActive: true,
      redirectUrl: "/admin?billing=already-active"
    };
  }

  const config = getIyzicoBillingConfig();
  const amount = context.plan.monthlyPrice.toString();
  const now = new Date();
  const billingPeriodEnd = addMonths(now, 1);
  const conversationId = `iyzico_billing_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  const { payment, requestPayload, checkoutRequest } = await prisma.$transaction(async (tx) => {
    const subscription = await getOrCreateLatestSubscription(tx, context);

    const invoice = await tx.platformInvoice.create({
      data: {
        restaurantId: context.restaurant.id,
        subscriptionId: subscription.id,
        invoiceNumber: invoiceNumber(now),
        status: InvoiceStatus.ISSUED,
        currency: context.plan.currency,
        amount,
        taxAmount: "0.00",
        discountAmount: "0.00",
        totalAmount: amount,
        description: `${context.plan.name} monthly plan`,
        billingPeriodStart: now,
        billingPeriodEnd,
        dueDate: now,
        issuedAt: now,
        metadata: toJsonObject({
          source: "billing-activation",
          planCode: context.plan.code
        })
      }
    });

    const payment = await tx.platformPayment.create({
      data: {
        restaurantId: context.restaurant.id,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        amount,
        currency: context.plan.currency,
        status: PlatformPaymentStatus.PENDING,
        provider: IYZICO_PROVIDER,
        method: PaymentMethodType.CARD,
        attemptCount: 1,
        lastAttemptedAt: now,
        metadata: toJsonObject({
          source: "billing-activation",
          planCode: context.plan.code
        })
      }
    });

    const checkoutRequest = buildBillingCheckoutRequest({
      paymentId: payment.id,
      paymentAmount: amount,
      buyerIp: getBuyerIp(input),
      conversationId,
      context,
      config
    });

    return {
      payment,
      checkoutRequest,
      requestPayload: toJsonObject({
        action: "IYZICO_BILLING_CHECKOUT_INITIALIZE",
        conversationId,
        request: {
          price: checkoutRequest.price,
          paidPrice: checkoutRequest.paidPrice,
          currency: checkoutRequest.currency,
          basketId: checkoutRequest.basketId,
          callbackUrl: checkoutRequest.callbackUrl
        }
      })
    };
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
      throw new Error(initializeResponse.errorMessage || "iyzico billing checkout could not be initialized.");
    }

    await prisma.platformPayment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: initializeResponse.token,
        metadata: toJsonObject({
          ...requestPayload,
          conversationId,
          paymentPageUrl: initializeResponse.paymentPageUrl,
          initializeResponse: {
            status: initializeResponse.status,
            token: initializeResponse.token,
            signatureValid
          }
        })
      }
    });

    return {
      alreadyActive: false,
      paymentPageUrl: initializeResponse.paymentPageUrl
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "iyzico billing checkout initialization failed.";

    await prisma.$transaction(async (tx) => {
      await tx.platformPayment.update({
        where: { id: payment.id },
        data: {
          status: PlatformPaymentStatus.FAILED,
          failureReason,
          metadata: toJsonObject({
            ...requestPayload,
            initializeFailure: {
              conversationId,
              reason: failureReason
            }
          })
        }
      });

      if (payment.invoiceId) {
        await tx.platformInvoice.update({
          where: { id: payment.invoiceId },
          data: {
            status: InvoiceStatus.FAILED,
            failedAt: new Date(),
            metadata: toJsonObject({
              source: "billing-activation",
              initializeFailure: failureReason
            })
          }
        });
      }
    });

    throw new Error("Pro odemesi baslatilamadi. Lutfen tekrar deneyin.");
  }
}

export async function finalizeProPlanActivation(input: {
  token?: string;
  callbackPayload?: JsonObject;
}) {
  const config = getIyzicoBillingConfig();
  const payment = await findBillingPaymentForCallback({
    token: input.token,
    callbackPayload: input.callbackPayload
  });

  if (!payment) {
    throw new Error("iyzico billing payment could not be matched.");
  }

  if (isPaymentActivationComplete(payment)) {
    return {
      status: PlatformPaymentStatus.SUCCEEDED,
      restaurantId: payment.restaurantId
    };
  }

  const token = input.token?.trim() || payment.providerPaymentId?.trim() || "";

  if (!token) {
    throw new Error("iyzico billing callback token is required.");
  }

  const storedConversationId = conversationIdFromPayment(payment) ?? undefined;

  const retrieveRequest = {
    locale: config.locale,
    conversationId: storedConversationId,
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

  assertExpectedBillingResult({
    response: retrieveResponse,
    payment: {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      providerPaymentId: payment.providerPaymentId,
      metadata: payment.metadata
    },
    token,
    config
  });

  const internalStatus = mapBillingResultStatus(retrieveResponse);
  const now = new Date();
  const currentPeriodEnd = addMonths(now, 1);
  const callbackPayload = toJsonObject({
    callback: input.callbackPayload ?? null,
    retrieveRequest,
    retrieveResponse: sanitizeIyzicoPayload(retrieveResponse),
    signatureValid
  });

  const result = await prisma.$transaction(async (tx) => {
    const latestPayment = await tx.platformPayment.findFirst({
      where: { provider: IYZICO_PROVIDER, providerPaymentId: token },
      include: {
        invoice: true,
        subscription: true
      }
    });

    if (!latestPayment) {
      throw new Error("iyzico billing payment could not be matched.");
    }

    const failureReason =
      internalStatus === PlatformPaymentStatus.FAILED
        ? paymentFailureMessage(retrieveResponse.errorMessage)
        : null;

    await tx.platformPayment.update({
      where: { id: latestPayment.id },
      data: {
        status: internalStatus,
        providerTransactionId: retrieveResponse.paymentId ?? latestPayment.providerTransactionId,
        failureReason,
        lastAttemptedAt: now,
        succeededAt: internalStatus === PlatformPaymentStatus.SUCCEEDED ? now : null,
        metadata: callbackPayload
      }
    });

    if (latestPayment.invoiceId) {
      await tx.platformInvoice.update({
        where: { id: latestPayment.invoiceId },
        data: internalStatus === PlatformPaymentStatus.SUCCEEDED
          ? {
              status: InvoiceStatus.PAID,
              paidAt: now,
              failedAt: null,
              metadata: callbackPayload
            }
          : {
              status: InvoiceStatus.FAILED,
              failedAt: now,
              metadata: callbackPayload
            }
      });
    }

    if (internalStatus === PlatformPaymentStatus.SUCCEEDED) {
      await tx.tenantSubscription.update({
        where: { id: latestPayment.subscriptionId },
        data: {
          planId: payment.subscription.planId,
          provider: IYZICO_PROVIDER,
          providerSubscriptionId: retrieveResponse.paymentId ?? token,
          status: SubscriptionStatus.ACTIVE,
          billingPeriod: "MONTHLY",
          currentPeriodStart: now,
          currentPeriodEnd,
          nextBillingDate: currentPeriodEnd,
          lastBillingDate: now,
          autoRenew: true,
          cancelAtPeriodEnd: false
        }
      });

      await tx.restaurant.update({
        where: { id: latestPayment.restaurantId },
        data: {
          currentPlanId: payment.subscription.planId,
          status: TenantStatus.ACTIVE,
          workspaceMode: WorkspaceMode.LIVE
        }
      });
    }

    return {
      status: internalStatus,
      restaurantId: latestPayment.restaurantId
    };
  });

  return {
    status: result.status,
    restaurantId: result.restaurantId
  };
}
