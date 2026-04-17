import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";

export const DEFAULT_PAYMENT_CURRENCY = "TRY" as const;

export const SUPPORTED_PAYMENT_SPLIT_MODES = [
  SplitMode.FULL_BY_ONE,
  SplitMode.EQUAL,
  SplitMode.BY_GUEST_ITEMS
] as const;

export const PAYMENT_ATTEMPT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export const CASHIER_PAYMENT_SHARE_ACTIONS = [
  "PAY_BY_CASH",
  "PAY_BY_CARD",
  "SEND_ONLINE_LINK",
  "COMPLETE_PENDING_PAYMENT",
  "MARK_PAYMENT_FAILED"
] as const;

export type SupportedPaymentSplitMode = (typeof SUPPORTED_PAYMENT_SPLIT_MODES)[number];

export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];
export type CashierPaymentShareAction = (typeof CASHIER_PAYMENT_SHARE_ACTIONS)[number];

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type PaymentShareDraft = {
  guestId: string | null;
  payerLabel: string;
  amount: string;
};

export type CreatePaymentSessionFromInvoiceInput = {
  sessionId: string;
  invoiceId: string;
  splitMode: SupportedPaymentSplitMode;
  totalAmount: string;
  currency?: string;
  shares: PaymentShareDraft[];
};

export type PaymentSessionRecord = {
  id: string;
  sessionId: string;
  invoiceId: string;
  splitMode: SupportedPaymentSplitMode;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  currency: typeof DEFAULT_PAYMENT_CURRENCY;
  status: PaymentSessionStatus;
  createdAt: string;
  updatedAt: string;
};

export type PaymentShareRecord = {
  id: string;
  paymentSessionId: string;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  status: PaymentShareStatus;
  provider: string | null;
  providerPaymentId: string | null;
  providerConversationId: string | null;
  paymentUrl: string | null;
  qrPayload: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAttemptRecord = {
  id: string;
  paymentShareId: string;
  provider: string;
  requestPayload: JsonValue;
  callbackPayload: JsonValue | null;
  status: PaymentAttemptStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoicePaymentBundle = {
  paymentSession: PaymentSessionRecord;
  paymentShares: PaymentShareRecord[];
};
