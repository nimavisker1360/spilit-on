import { PaymentSessionStatus, PaymentShareStatus, SplitMode } from "@prisma/client";
import { z } from "zod";

import { toCents } from "@/lib/currency";
import {
  CASHIER_PAYMENT_SHARE_ACTIONS,
  DEFAULT_PAYMENT_CURRENCY,
  PAYMENT_ATTEMPT_STATUSES,
  SUPPORTED_PAYMENT_SPLIT_MODES,
  type JsonValue
} from "@/features/payment/payment.types";

const decimalStringSchema = z
  .string()
  .regex(/^\d+\.\d{2}$/, "Amount must be a decimal string with exactly 2 fraction digits.");

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const supportedPaymentSplitModeSchema = z
  .nativeEnum(SplitMode)
  .refine((mode) => SUPPORTED_PAYMENT_SPLIT_MODES.includes(mode), {
    message: "Unsupported payment split mode."
  });

export const paymentShareDraftSchema = z
  .object({
    userId: z.string().min(1).nullable().optional(),
    guestId: z.string().min(1).nullable(),
    payerLabel: z.string().trim().min(1).max(120),
    amount: decimalStringSchema
  })
  .strict();

export const createPaymentSessionFromInvoiceSchema = z
  .object({
    sessionId: z.string().min(1),
    invoiceId: z.string().min(1),
    splitMode: supportedPaymentSplitModeSchema,
    totalAmount: decimalStringSchema,
    currency: z.literal(DEFAULT_PAYMENT_CURRENCY).default(DEFAULT_PAYMENT_CURRENCY),
    shares: z.array(paymentShareDraftSchema).min(1)
  })
  .strict()
  .superRefine((value, context) => {
    const totalCents = toCents(value.totalAmount);
    const splitCents = value.shares.reduce((sum, share) => sum + toCents(share.amount), 0);

    if (splitCents !== totalCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shares"],
        message: "Payment shares must sum to the invoice total."
      });
    }
  });

export const generatePaymentSessionFromInvoiceSchema = z
  .object({
    invoiceId: z.string().min(1)
  })
  .strict();

export const cashierPaymentShareActionSchema = z.enum(CASHIER_PAYMENT_SHARE_ACTIONS);

export const applyCashierPaymentShareActionSchema = z
  .object({
    paymentShareId: z.string().min(1),
    action: cashierPaymentShareActionSchema
  })
  .strict();

export const applyGuestPaymentSharePaymentSchema = z
  .object({
    paymentShareId: z.string().min(1),
    userId: z.string().trim().min(1).nullable().optional(),
    guestId: z.string().trim().min(1).nullable().optional(),
    tip: decimalStringSchema.default("0.00")
  })
  .strict();

export const paymentSessionRecordSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    invoiceId: z.string().min(1),
    splitMode: supportedPaymentSplitModeSchema,
    totalAmount: decimalStringSchema,
    paidAmount: decimalStringSchema,
    remainingAmount: decimalStringSchema,
    currency: z.literal(DEFAULT_PAYMENT_CURRENCY),
    status: z.nativeEnum(PaymentSessionStatus),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const paymentShareRecordSchema = z
  .object({
    id: z.string().min(1),
    paymentSessionId: z.string().min(1),
    userId: z.string().min(1).nullable(),
    guestId: z.string().min(1).nullable(),
    payerLabel: z.string().trim().min(1).max(120),
    amount: decimalStringSchema,
    tip: decimalStringSchema,
    status: z.nativeEnum(PaymentShareStatus),
    provider: z.string().trim().min(1).max(64).nullable(),
    providerPaymentId: z.string().trim().min(1).max(128).nullable(),
    providerConversationId: z.string().trim().min(1).max(128).nullable(),
    paymentUrl: z.string().url().nullable(),
    qrPayload: z.string().trim().min(1).nullable(),
    paidAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
);

export const paymentAttemptRecordSchema = z
  .object({
    id: z.string().min(1),
    paymentShareId: z.string().min(1),
    provider: z.string().trim().min(1).max(64),
    requestPayload: jsonValueSchema,
    callbackPayload: jsonValueSchema.nullable(),
    status: z.enum(PAYMENT_ATTEMPT_STATUSES),
    failureReason: z.string().trim().min(1).nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();
