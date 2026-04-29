-- CreateEnum InvoiceStatus
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum PaymentMethodType
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'BANK_TRANSFER', 'CRYPTO');

-- CreateEnum PlatformPaymentStatus
CREATE TYPE "PlatformPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- AlterTable TenantSubscription - Add new columns
ALTER TABLE "TenantSubscription" ADD COLUMN "nextBillingDate" TIMESTAMP(3),
ADD COLUMN "lastBillingDate" TIMESTAMP(3),
ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "paymentMethodId" TEXT;

-- CreateTable PaymentMethod
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "providerPaymentMethodId" VARCHAR(128),
    "last4" VARCHAR(4),
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "holderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlatformInvoice
CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "amount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlatformPayment
CREATE TABLE "PlatformPayment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TRY',
    "status" "PlatformPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(64) NOT NULL,
    "providerPaymentId" VARCHAR(128),
    "providerTransactionId" VARCHAR(128),
    "method" "PaymentMethodType",
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex PaymentMethod
CREATE INDEX "PaymentMethod_restaurantId_idx" ON "PaymentMethod"("restaurantId");
CREATE INDEX "PaymentMethod_provider_providerPaymentMethodId_idx" ON "PaymentMethod"("provider", "providerPaymentMethodId");

-- CreateIndex PlatformInvoice
CREATE UNIQUE INDEX "PlatformInvoice_restaurantId_invoiceNumber_key" ON "PlatformInvoice"("restaurantId", "invoiceNumber");
CREATE INDEX "PlatformInvoice_restaurantId_status_idx" ON "PlatformInvoice"("restaurantId", "status");
CREATE INDEX "PlatformInvoice_subscriptionId_status_idx" ON "PlatformInvoice"("subscriptionId", "status");
CREATE INDEX "PlatformInvoice_dueDate_status_idx" ON "PlatformInvoice"("dueDate", "status");
CREATE INDEX "PlatformInvoice_issuedAt_idx" ON "PlatformInvoice"("issuedAt");

-- CreateIndex PlatformPayment
CREATE INDEX "PlatformPayment_restaurantId_status_idx" ON "PlatformPayment"("restaurantId", "status");
CREATE INDEX "PlatformPayment_subscriptionId_status_idx" ON "PlatformPayment"("subscriptionId", "status");
CREATE INDEX "PlatformPayment_invoiceId_idx" ON "PlatformPayment"("invoiceId");
CREATE INDEX "PlatformPayment_provider_providerPaymentId_idx" ON "PlatformPayment"("provider", "providerPaymentId");
CREATE INDEX "PlatformPayment_succeededAt_idx" ON "PlatformPayment"("succeededAt");

-- Add index to TenantSubscription for nextBillingDate
CREATE INDEX "TenantSubscription_nextBillingDate_idx" ON "TenantSubscription"("nextBillingDate");

-- Add foreign key constraints
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE;

ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE;
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE CASCADE;

ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE;
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE CASCADE;
ALTER TABLE "PlatformPayment" ADD CONSTRAINT "PlatformPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL;

ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL;
