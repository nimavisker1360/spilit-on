import { randomBytes } from "node:crypto";
import { centsToDecimalString, toCents } from "@/lib/currency";

function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export const MOCK_GUEST_PAYMENT_PROVIDER = "MOCK_QR_PAYMENT";

export type MockPaymentChargeInput = {
  paymentShareId: string;
  userId: string | null;
  amount: string;
  tip: string;
  currency: string;
};

export type MockPaymentChargeResult = {
  provider: typeof MOCK_GUEST_PAYMENT_PROVIDER;
  providerPaymentId: string;
  providerConversationId: string;
  amount: string;
  tip: string;
  totalCharged: string;
  currency: string;
  status: "SUCCEEDED";
};

export function createMockPaymentCharge(input: MockPaymentChargeInput): MockPaymentChargeResult {
  const amountCents = toCents(input.amount);
  const tipCents = toCents(input.tip);
  const providerPaymentId = makeId("mock_payment");

  if (amountCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (tipCents < 0) {
    throw new Error("Tip cannot be negative.");
  }

  return {
    provider: MOCK_GUEST_PAYMENT_PROVIDER,
    providerPaymentId,
    providerConversationId: `${providerPaymentId}:${input.paymentShareId}:${input.userId ?? "anonymous"}`,
    amount: centsToDecimalString(amountCents),
    tip: centsToDecimalString(tipCents),
    totalCharged: centsToDecimalString(amountCents + tipCents),
    currency: input.currency,
    status: "SUCCEEDED"
  };
}
